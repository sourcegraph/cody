import assert from 'node:assert'
import stable_stringify from 'fast-json-stable-stringify'

import { createPatch } from 'diff'

import { execSync, spawn } from 'node:child_process'
import fspromises from 'node:fs/promises'
import path from 'node:path'
import {
    type ClientCapabilities,
    type ContextItem,
    type SerializedChatMessage,
    logError,
} from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { applyPatch } from 'fast-myers-diff'
import * as vscode from 'vscode'
import type { Uri } from 'vscode'
import {
    type MessageConnection,
    StreamMessageReader,
    StreamMessageWriter,
    createMessageConnection,
} from 'vscode-jsonrpc/node'
import type { ExtensionMessage, ExtensionTranscriptMessage } from '../../vscode/src/chat/protocol'
import { doesFileExist } from '../../vscode/src/commands/utils/workspace-files'
import { ProtocolTextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'
import { mockLocalStorage } from '../../vscode/src/services/LocalStorageProvider'
import {
    TESTING_CREDENTIALS,
    type TestingCredentials,
} from '../../vscode/src/testutils/testing-credentials'
import { AgentStatelessSecretStorage } from './AgentSecretStorage'
import { AgentTextDocument } from './AgentTextDocument'
import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'
import { allClientCapabilitiesEnabled } from './allClientCapabilitiesEnabled'
import { MessageHandler, type NotificationMethodName } from './jsonrpc-alias'
import type {
    AutocompleteParams,
    AutocompleteResult,
    ClientInfo,
    CreateFileOperation,
    DebugMessage,
    ExtensionConfiguration,
    NetworkRequest,
    Position,
    ProgressReportParams,
    ProgressStartParams,
    ProtocolCodeLens,
    ProtocolTextDocument,
    Range,
    ServerInfo,
    ShowWindowMessageParams,
    TextDocumentEditParams,
    WebviewPostMessageParams,
    WorkspaceEditParams,
} from './protocol-alias'
import { trimEndOfLine } from './trimEndOfLine'
import { protocolRange } from './vscode-type-converters'

type ProgressMessage = ProgressStartMessage | ProgressReportMessage | ProgressEndMessage

interface ProgressStartMessage {
    method: 'progress/start'
    id: string
    message: ProgressStartParams
}
interface ProgressReportMessage {
    method: 'progress/report'
    id: string
    message: ProgressReportParams
}
interface ProgressEndMessage {
    method: 'progress/end'
    id: string
    message: Record<string, never>
}

export function getAgentDir(): string {
    const cwd = process.cwd()
    return path.basename(cwd) === 'agent' ? cwd : path.join(cwd, 'agent')
}

interface TestClientParams {
    readonly workspaceRootUri: vscode.Uri
    readonly name: string
    readonly credentials: TestingCredentials
    bin?: string
    telemetryExporter?: 'testing' | 'graphql' // defaults to testing, which doesn't send telemetry
    onWindowRequest?: (params: ShowWindowMessageParams) => Promise<string>
    extraConfiguration?: Record<string, any>
    capabilities?: ClientCapabilities
}

export function setupRecording(): void {
    const mayRecord =
        process.env.CODY_RECORDING_MODE === 'record' || process.env.CODY_RECORD_IF_MISSING === 'true'
    if (mayRecord) {
        try {
            // Fail fast if we're trying to record without being authenticated.
            // Without this check, the error message can be cryptic if you try
            // to record without being authenticated.
            execSync('src login', {
                stdio: 'inherit',
                env: {
                    ...process.env,
                    SRC_ACCESS_TOKEN: TESTING_CREDENTIALS.enterprise.token,
                    SERVER_ENDPOINT: TESTING_CREDENTIALS.enterprise.serverEndpoint,
                },
            })
        } catch {
            throw new Error(
                "Can't record HTTP requests without being authenticated. " +
                    'To fix this problem, run:\n  source agent/scripts/export-cody-http-recording-tokens.sh'
            )
        }
    }
}

export class TestClient extends MessageHandler {
    private extensionConfigurationDuringInitialization: ExtensionConfiguration | undefined
    public static create({ bin = 'node', ...params }: TestClientParams): TestClient {
        setupRecording()
        const agentDir = getAgentDir()
        const recordingDirectory = path.join(agentDir, 'recordings')
        const agentScript = path.join(agentDir, 'dist', 'index.js')

        const args =
            bin === 'node'
                ? [
                      '--enable-source-maps',
                      '--expose-gc', // Used by `memory.test.ts` to reproduce memory leaks.
                      agentScript,
                      'api',
                      'jsonrpc-stdio',
                  ]
                : ['api', 'jsonrpc-stdio']

        const child = spawn(bin, args, {
            stdio: 'pipe',
            cwd: agentDir,
            env: {
                CODY_SHIM_TESTING: 'true',
                CODY_TEMPERATURE_ZERO: 'true',
                CODY_DISABLE_FASTPATH: 'true', // Fastpass has custom bearer tokens that are difficult to record with Polly
                CODY_RECORDING_MODE: 'replay', // can be overwritten with process.env.CODY_RECORDING_MODE
                CODY_RECORDING_DIRECTORY: recordingDirectory,
                CODY_RECORDING_NAME: params.name,
                SRC_ACCESS_TOKEN: params.credentials?.token ?? '',
                REDACTED_SRC_ACCESS_TOKEN: params.credentials?.redactedToken ?? '',
                CODY_TELEMETRY_EXPORTER: params.telemetryExporter ?? 'testing',
                DISABLE_FEATURE_FLAGS: 'true',
                DISABLE_UPSTREAM_HEALTH_PINGS: 'true',
                ...process.env,
            },
        })
        child.on('error', error => console.error('TestClient spawn error:', error))
        child.on('exit', code => {
            if (code !== 0) {
                console.error(`TestClient spawn exit code ${code}`)
            }
        })
        child.stderr.on('data', data => {
            console.error(`----stderr----\n${data}--------------`)
        })
        const conn = createMessageConnection(
            new StreamMessageReader(child.stdout),
            new StreamMessageWriter(child.stdin)
        )
        return new TestClient(conn, params)
    }

    public info: ClientInfo
    // Array of all raw `progress/*` notification. Typed as `any` because
    // start/end/report have different types.
    public progressMessages: ProgressMessage[] = []
    public progressIDs = new Map<string, number>()
    public progressStartEvents = new vscode.EventEmitter<ProgressStartParams>()
    public readonly name: string
    public workspace = new AgentWorkspaceDocuments({})
    public workspaceEditParams: WorkspaceEditParams[] = []
    public textDocumentEditParams: TextDocumentEditParams[] = []
    public expectedEvents: string[] = []
    public secrets = new AgentStatelessSecretStorage()
    public userInput: {
        instruction: string
        model?: string
    } = { instruction: '' }

    get serverEndpoint(): string {
        return this.params.credentials.serverEndpoint
    }
    get completionProvider(): string {
        return this.params?.extraConfiguration?.['cody.autocomplete.advanced.provider'] ?? ''
    }
    get completionModel(): string {
        return this.params?.extraConfiguration?.['cody.autocomplete.advanced.model'] ?? ''
    }

    constructor(
        conn: MessageConnection,
        public readonly params: TestClientParams
    ) {
        super(conn)

        this.name = params.name
        this.info = this.getClientInfo(params.capabilities)

        this.registerNotification('progress/start', message => {
            this.progressStartEvents.fire(message)
            message.id = this.progressID(message.id)
            this.progressMessages.push({
                method: 'progress/start',
                id: message.id,
                message,
            })
        })
        this.registerNotification('progress/report', message => {
            message.id = this.progressID(message.id)
            this.progressMessages.push({
                method: 'progress/report',
                id: message.id,
                message,
            })
        })
        this.registerNotification('progress/end', ({ id }) => {
            this.progressMessages.push({
                method: 'progress/end',
                id: this.progressID(id),
                message: {},
            })
        })
        this.registerRequest('secrets/get', async ({ key }) => {
            return this.secrets.get(key) ?? null
        })
        this.registerRequest('secrets/store', async ({ key, value }) => {
            await this.secrets.store(key, value)
            return null
        })
        this.registerRequest('secrets/delete', async ({ key }) => {
            await this.secrets.delete(key)
            return null
        })
        this.registerRequest('window/showMessage', params => {
            if (this.params.onWindowRequest) {
                return this.params.onWindowRequest(params)
            }
            if (params?.items && params.items.length > 0) {
                this.logMessage({
                    channel: 'vscode.window.show{Error,Warning,Information}Message',
                    message: dedent`Unimplemented window/showMessage: ${JSON.stringify(params)}
                           This promise will never resolve, emulating a user who never clicks on the action items.
                           If this test is hanging, you need to refactor the code to avoid calling vscode.window.{showErrorMessage,showWarningMessage,showInformationMessage}.`,
                })
                return new Promise(() => {})
            }
            return Promise.resolve(null)
        })
        this.registerNotification('codeLenses/display', async params => {
            this.codeLenses.set(params.uri, params.codeLenses)
            this.codeLensUpdate.fire(params.codeLenses)
        })

        this.registerRequest('workspace/edit', async params => {
            this.workspaceEditParams.push(params)
            // NOTE(olafurpg): this is a best-effort implementation of what an
            // editor would do.  For IDE client implementations like JetBrains,
            // I think it's worth adding detailed tests to cover all possible
            // scenarios because it's easy to leave out a critical
            // implementation detail that causes us to waste a lot of time
            // debugging something that should have been done the Right Way
            // from the start.
            let result = true
            const createdFiles: CreateFileOperation[] = []
            for (const operation of params.operations) {
                if (operation.type === 'edit-file') {
                    const protocolDocument = await this.editDocument(operation)
                    this.notify('textDocument/didChange', protocolDocument.underlying)
                } else if (operation.type === 'create-file') {
                    const fileExists = await doesFileExist(vscode.Uri.parse(operation.uri))
                    if (operation.options?.ignoreIfExists && fileExists) {
                        result = false
                        continue
                    }
                    if (fileExists && !operation.options?.overwrite) {
                        result = false
                        logError(
                            'workspace/edit',
                            'cannot create file that already exists and options.overwrite=false',
                            operation.uri
                        )
                        continue
                    }
                    const fspath = vscode.Uri.file(operation.uri).fsPath
                    await fspromises.mkdir(path.dirname(fspath), { recursive: true })
                    await fspromises.writeFile(fspath, operation.textContents)
                    createdFiles.push(operation)
                }
            }

            if (createdFiles.length > 0) {
                this.notify('workspace/didCreateFiles', { files: createdFiles })
            }

            return result
        })
        this.registerRequest('textDocument/edit', async params => {
            this.textDocumentEditParams.push(params)
            const protocolDocument = await this.editDocument(params)
            this.notify('textDocument/didChange', protocolDocument.underlying)
            return Promise.resolve(true)
        })
        this.registerRequest('textDocument/show', () => {
            return Promise.resolve(true)
        })
        this.registerRequest('editTask/getUserInput', async params => {
            return {
                instruction: this.userInput.instruction ?? params.instruction,
                selectedModelId: this.userInput.model ?? params.selectedModelId,
            }
        })
        this.registerNotification('debug/message', message => {
            this.logMessage(message)
        })

        this.registerNotification('autocomplete/didHide', () => {
            this.autocompleteHide.fire(null)
        })
        this.registerNotification('autocomplete/didTrigger', () => {
            this.autocompleteTrigger.fire(null)
        })

        this.registerNotification('webview/postMessage', params => {
            this.webviewMessages.push(params)
            this.webviewMessagesEmitter.fire(params)
        })

        this.registerNotification('extensionConfiguration/didUpdate', params => {
            this.extensionConfigurationUpdates.push(params)
        })
    }

    private async editDocument(params: TextDocumentEditParams): Promise<ProtocolTextDocumentWithUri> {
        const document = await this.workspace.openTextDocument(vscode.Uri.parse(params.uri))
        const patches = params.edits.map<[number, number, string]>(edit => {
            switch (edit.type) {
                case 'delete':
                    return [document.offsetAt(edit.range.start), document.offsetAt(edit.range.end), '']
                case 'insert':
                    return [
                        document.offsetAt(edit.position),
                        document.offsetAt(edit.position),
                        edit.value,
                    ]
                case 'replace':
                    return [
                        document.offsetAt(edit.range.start),
                        document.offsetAt(edit.range.end),
                        edit.value,
                    ]
            }
        })
        const updatedContent = [...applyPatch(document.content, patches)].join('')
        const protocolDocument = ProtocolTextDocumentWithUri.from(document.uri, {
            content: updatedContent,
        })
        this.workspace.loadDocument(protocolDocument)
        return protocolDocument
    }
    private logMessage(params: DebugMessage): void {
        // Uncomment below to see `logDebug` messages.
        // console.log(`${params.channel}: ${params.message}`)
    }

    public async openFile(uri: Uri, params?: TextDocumentEventParams): Promise<null> {
        await this.textDocumentEvent(uri, 'textDocument/didOpen', params)
        return await this.request('testing/awaitPendingPromises', null)
    }

    public async changeFile(uri: Uri, params?: TextDocumentEventParams): Promise<null> {
        await this.textDocumentEvent(uri, 'textDocument/didChange', params)
        return await this.request('testing/awaitPendingPromises', null)
    }

    public async textDocumentEvent(
        uri: Uri,
        method: NotificationMethodName,
        params?: TextDocumentEventParams
    ): Promise<void> {
        const selectionName = params?.selectionName ?? 'SELECTION'
        let content: string = params?.text
            ? params.text
            : (await doesFileExist(uri))
              ? await fspromises.readFile(uri.fsPath, 'utf8')
              : ''
        const selectionStartMarker = `/* ${selectionName}_START */`
        const selectionEndMarker = `/* ${selectionName}_END */`
        const selectionStart = content.indexOf(selectionStartMarker)
        const selectionEnd = content.indexOf(selectionEndMarker)
        const cursor = content.indexOf('/* CURSOR */')
        if (selectionStart < 0 && selectionEnd < 0 && params?.selectionName) {
            throw new Error(`No selection found for name ${params.selectionName}`)
        }

        if (params?.removeCursor !== undefined ? params.removeCursor : true) {
            content = content.replace('/* CURSOR */', '')
        }

        const document = AgentTextDocument.from(uri, content, params)
        const start =
            cursor >= 0
                ? document.positionAt(cursor)
                : selectionStart >= 0
                  ? document.positionAt(selectionStart + selectionStartMarker.length)
                  : undefined
        const end =
            cursor >= 0 ? start : selectionEnd >= 0 ? document.positionAt(selectionEnd) : undefined
        const protocolDocument: ProtocolTextDocument = {
            uri: uri.toString(),
            content,
            selection: params?.selection ?? (start && end ? { start, end } : undefined),
        }
        const clientDocument = this.workspace.loadDocument(
            ProtocolTextDocumentWithUri.fromDocument(protocolDocument)
        )
        const clientEditor = this.workspace.newTextEditor(clientDocument)
        const visibleRange = clientEditor.visibleRanges?.[0]

        protocolDocument.testing = {
            selectedText: clientDocument.getText(clientEditor.selection),
            sourceOfTruthDocument: {
                uri: clientDocument.uri.toString(),
                content: clientDocument.getText(),
                selection: protocolRange(clientEditor.selection),
                visibleRange: visibleRange ? protocolRange(visibleRange) : undefined,
            },
        }

        this.workspace.activeDocumentFilePath = uri
        this.notify(method, protocolDocument)
    }

    public async documentCode(uri: vscode.Uri): Promise<string> {
        await this.openFile(uri, { removeCursor: false })
        const task = await this.request('command/execute', { command: 'cody.command.document-code' })
        await this.acceptEditTask(uri, task)
        return this.workspace.getDocument(uri)?.content ?? ''
    }

    public async generateUnitTestFor(uri: vscode.Uri, line: number): Promise<TestInfo | undefined> {
        await this.openFile(uri, {
            removeCursor: false,
            selection: {
                start: { line, character: 0 },
                end: { line, character: 0 },
            },
        })

        const task = await this.request('command/execute', { command: 'cody.command.unit-tests' })
        await this.acceptEditTask(uri, task)
        return this.getTestEdit()
    }

    private async getTestEdit(): Promise<TestInfo | undefined> {
        // first check if a new text file was created in the workspace
        if (this.textDocumentEditParams.length === 1) {
            const [editParams] = this.textDocumentEditParams
            for (const edit of editParams.edits) {
                if (edit.type === 'replace') {
                    return {
                        uri: vscode.Uri.parse(editParams.uri).with({ scheme: 'file' }),
                        value: edit.value,
                        fullFile: edit.value,
                        isUpdate: false,
                    }
                }
            }
        }
        // Otherwise it is an update to test file so it should
        for (const param of this.workspaceEditParams) {
            for (const operation of param.operations) {
                if (operation.type === 'edit-file') {
                    for (const edit of operation.edits) {
                        // looks for a replace with an appropriate range
                        if (
                            edit.type === 'replace' &&
                            !isPositionEqual(edit.range.start, edit.range.end)
                        ) {
                            const uri = vscode.Uri.parse(operation.uri).with({ scheme: 'file' })
                            await this.openFile(uri)
                            return {
                                uri,
                                value: edit.value,
                                fullFile: this.documentText(uri),
                                isUpdate: true,
                            }
                        }
                    }
                }
            }
        }

        return undefined
    }

    public async autocompleteText(params?: Partial<AutocompleteParams>): Promise<string[]> {
        const result = await this.autocomplete(params)
        return result.items.map(item => item.insertText)
    }
    public autocomplete(params?: Partial<AutocompleteParams>): Promise<AutocompleteResult> {
        if (!this.workspace.activeDocumentFilePath) {
            throw new Error('No active document')
        }
        const document = this.workspace.getDocument(this.workspace.activeDocumentFilePath)
        const position = document?.protocolDocument?.selection?.start
        if (position === undefined) {
            throw new Error('No cursor position')
        }
        return this.request('autocomplete/execute', {
            uri: this.workspace.activeDocumentFilePath.toString(),
            position,
            ...params,
        })
    }

    private progressID(id: string): string {
        const fromCache = this.progressIDs.get(id)
        if (fromCache !== undefined) {
            return `ID_${fromCache}`
        }
        const freshID = this.progressIDs.size
        this.progressIDs.set(id, freshID)
        return `ID_${freshID}`
    }

    public acceptLensWasShown(uri: Uri): Promise<void> {
        const lenses = this.codeLenses.get(uri.toString()) ?? []
        if (lenses.find(l => l.command?.command === 'cody.fixup.codelens.accept')) {
            return Promise.resolve()
        }

        let disposables: vscode.Disposable[]
        return new Promise<void>((resolve, reject) => {
            disposables = [
                this.onCodeLensUpdate(codeLenses => {
                    if (codeLenses.find(l => l.command?.command === 'cody.fixup.codelens.accept')) {
                        return resolve()
                    }
                }),
            ]
        }).finally(() => {
            for (const disposable of disposables) {
                disposable.dispose()
            }
        })
    }

    public codeLenses = new Map<string, ProtocolCodeLens[]>()
    public codeLensUpdate = new vscode.EventEmitter<ProtocolCodeLens[]>()
    public onCodeLensUpdate = this.codeLensUpdate.event
    public autocompleteHide = new vscode.EventEmitter()
    public onDidHideAutocomplete = this.autocompleteHide.event
    public autocompleteTrigger = new vscode.EventEmitter()
    public onDidTriggerAutocomplete = this.autocompleteTrigger.event

    public webviewMessages: WebviewPostMessageParams[] = []
    public webviewMessagesEmitter = new vscode.EventEmitter<WebviewPostMessageParams>()

    public extensionConfigurationUpdates: Record<string, string | undefined | null>[] = []

    /**
     * Returns a promise of the first `type: 'transcript'` message where
     * `isMessageInProgress: false` and messages is non-empty. This is a helper
     * function you may need to re-implement if you are writing a Cody client to
     * write tests. The tricky bit is that we don't have full control over when
     * the server starts streaming messages to the client, it may start before
     * chat/new or commands/* requests respond with the ID of the chat session.
     * Therefore, the only way to correctly identify the first reply in the chat session
     * is by 1) recording all `webview/postMessage` for unknown IDs and 2)
     * implement a similar helper that deals with both cases where the first message
     * has already been sent and when it hasn't been sent.
     */
    public firstNonEmptyTranscript(id: string): Promise<ExtensionTranscriptMessage> {
        const disposables: vscode.Disposable[] = []
        return new Promise<ExtensionTranscriptMessage>((resolve, reject) => {
            const onMessage = (message: WebviewPostMessageParams): void => {
                if (message.id !== id) {
                    return
                }
                if (
                    message.message.type === 'transcript' &&
                    message.message.messages.length > 0 &&
                    !message.message.isMessageInProgress
                ) {
                    resolve(message.message)
                } else if (message.message.type === 'errors') {
                    reject(new Error(`expected transcript, obtained ${JSON.stringify(message.message)}`))
                }
            }

            for (const message of this.webviewMessages) {
                onMessage(message)
            }
            disposables.push(this.webviewMessagesEmitter.event(params => onMessage(params)))
        }).finally(() => vscode.Disposable.from(...disposables).dispose())
    }

    public async initialize(additionalConfig?: Partial<ExtensionConfiguration>): Promise<ServerInfo> {
        this.conn.listen()

        try {
            const serverInfo = await this.handshake(this.info, additionalConfig)
            assert.deepStrictEqual(serverInfo.name, 'cody-agent', 'Agent should be cody-agent')
            return serverInfo
        } catch (error) {
            if (error === undefined) {
                throw new Error('Agent failed to initialize, error is undefined')
            }
            if (error instanceof Error) {
                throw error
            }
            throw new TypeError(`Agent failed to initialize, error is ${JSON.stringify(error)}`, {
                cause: error,
            })
        }
    }

    public async reset(id: string): Promise<void> {
        await this.request('webview/receiveMessage', {
            id,
            message: { command: 'chatSession', action: 'new' },
        })
    }

    public async acceptEditTask(uri: vscode.Uri, taskId: string): Promise<void> {
        await this.acceptLensWasShown(uri)
        await this.request('editTask/accept', taskId)
    }

    public documentText(uri: vscode.Uri): string {
        const document = this.workspace.getDocument(uri)
        if (document === undefined) {
            throw new Error(`Document not found: ${uri}`)
        }
        return trimEndOfLine(document.getText())
    }

    public async editMessage(
        id: string,
        text: string,
        params?: {
            contextFiles?: ContextItem[]
            index?: number
        }
    ): Promise<SerializedChatMessage | undefined> {
        const reply = asTranscriptMessage(
            await this.request('chat/editMessage', {
                id,
                message: {
                    command: 'edit',
                    text,
                    index: params?.index,
                    contextItems: params?.contextFiles ?? [],
                },
            })
        )
        return reply.messages.at(-1)
    }

    public async sendMessage(
        id: string,
        text: string,
        params?: { contextFiles?: ContextItem[] }
    ): Promise<SerializedChatMessage | undefined> {
        return (
            await this.sendSingleMessageToNewChatWithFullTranscript(text, {
                ...params,
                id,
            })
        )?.lastMessage
    }

    public async sendSingleMessageToNewChat(
        text: string,
        params?: { contextFiles?: ContextItem[] }
    ): Promise<SerializedChatMessage | undefined> {
        return (await this.sendSingleMessageToNewChatWithFullTranscript(text, params))?.lastMessage
    }

    public async sendSingleMessageToNewChatWithFullTranscript(
        text: string,
        params?: {
            contextFiles?: ContextItem[]
            id?: string
        }
    ): Promise<{
        lastMessage?: SerializedChatMessage
        panelID: string
        transcript: ExtensionTranscriptMessage
    }> {
        const id = params?.id ?? (await this.request('chat/new', null))
        const reply = asTranscriptMessage(
            await this.request('chat/submitMessage', {
                id,
                message: {
                    command: 'submit',
                    text,
                    contextItems: params?.contextFiles,
                },
            })
        )
        return {
            panelID: id,
            transcript: reply,
            lastMessage: reply.messages.at(-1),
        }
    }

    // Given the following missing recording, tries to find an existing
    // recording that has the closest levenshtein distance and prints out a
    // unified diff. This could save a lot of time trying to debug a test
    // failure caused by missing recordings for common scenarios like 1) leaking
    // an absolute file path into the prompt or 2) forgetting to sort context
    // files.
    private async printDiffAgainstClosestMatchingRecording(
        missingRecording: NetworkRequest
    ): Promise<void> {
        const message = missingRecording.error ?? ''
        const jsonText = message.split('\n').slice(1).join('\n')
        const json = JSON.parse(jsonText)
        const bodyText = json?.body ?? '{}'
        const body = JSON.parse(bodyText)
        const { closestBody } = await this.request('testing/closestPostData', {
            url: json?.url ?? '',
            postData: bodyText,
        })

        if (closestBody) {
            // Need to go through stable_stringify to get meaningful diffs.
            // Without this step, we get noisy diffs about different object
            // property ordering.
            const oldChange = JSON.stringify(JSON.parse(stable_stringify(body)), null, 2)
            const newChange = JSON.stringify(
                JSON.parse(stable_stringify(JSON.parse(closestBody))),
                null,
                2
            )
            if (oldChange === newChange) {
                console.log(
                    dedent`There exists a recording with exactly the same request body, but for some reason the recordings did not match.
                           This only really happens in exceptional cases like
                           - There is a bug in how Polly computes HTTP request identifiers
                           - Somebody manually edited the HTTP recording file
                           Possible ways to fix the problem:
                           - Confirm tests run in passthrough mode: CODY_RECORDING_MODE=passthrough pnpm test agent/src/index.test.ts
                           - Reset recordings and re-record everything: rm -rf agent/recordings && pnpm update-agent-recordings
                           `
                )
            } else {
                const patch = createPatch(
                    missingRecording.url,
                    oldChange,
                    newChange,
                    'the request in this test that has no matching recording',
                    'the closest matching recording in the recording file'
                )
                console.log(
                    `
Found a recording in the recording file that looks similar to this request that has no matching recording.
Sometimes this happens when our prompt construction logic is non-determinic. For example, if we expose
an absolute file path in the recording, then the tests fail in CI because the absolutely file path in CI
is different from the one in the recording file. Another example, sometimes the ordering of context files
is non-deterministic resulting in failing tests in CI because the ordering of context files in CI is different.
Closely inspect the diff below to non-determinic prompt construction is the reason behind this failure.
${patch}`
                )
            }
        }
    }

    public async beforeAll(
        additionalConfig?: Partial<ExtensionConfiguration>,
        { expectAuthenticated = true }: { expectAuthenticated?: boolean } = {}
    ) {
        mockLocalStorage('inMemory')
        const info = await this.initialize(additionalConfig)
        if (expectAuthenticated && !info.authStatus?.authenticated) {
            throw new Error('Could not log in. Auth status: ' + JSON.stringify(info.authStatus))
        }
    }
    public async afterAll() {
        await this.shutdownAndExit()
    }
    public async shutdownAndExit() {
        if (this.isAlive()) {
            const { errors } = await this.request('testing/requestErrors', null)
            const missingRecordingErrors = errors.filter(({ error }) =>
                error?.includes?.('`recordIfMissing` is')
            )
            if (missingRecordingErrors.length > 0) {
                for (const error of missingRecordingErrors) {
                    try {
                        await this.printDiffAgainstClosestMatchingRecording(error)
                    } catch (error) {
                        console.error('Error printing diff:', error)
                    }
                }
                const errorMessage = missingRecordingErrors[0].error?.split?.('\n')?.[0]
                throw new Error(
                    dedent`${errorMessage}.

                           To fix this problem, run the following commands to update the HTTP recordings:

                             source agent/scripts/export-cody-http-recording-tokens.sh
                             pnpm update-agent-recordings`
                )
            }
            await this.request('shutdown', null)
            this.notify('exit', null)
        } else {
            console.error('Agent has already exited')
        }
    }

    public async lastCompletionRequest(): Promise<NetworkRequest | undefined> {
        const { requests } = await this.request('testing/networkRequests', null)
        return requests.filter(({ url }) => url.includes('/completions/')).at(-1)
    }

    private async handshake(
        clientInfo: ClientInfo,
        additionalConfig?: Partial<ExtensionConfiguration>
    ): Promise<ServerInfo> {
        if (this.extensionConfigurationDuringInitialization !== undefined) {
            throw new Error(
                'the "initialize" request has already been sent. ' +
                    'To fix this problem, make sure you only call "initialize" only once.'
            )
        }
        this.extensionConfigurationDuringInitialization = {
            serverEndpoint: 'https://invalid',
            accessToken: 'invalid',
            customHeaders: {},
            ...clientInfo.extensionConfiguration,
            ...additionalConfig,
        }
        return new Promise((resolve, reject) => {
            setTimeout(
                () =>
                    reject(
                        new Error(
                            "Agent didn't initialize within 10 seconds, something is most likely wrong." +
                                " If you think it's normal for the agent to use more than 10 seconds to initialize," +
                                ' increase this timeout.'
                        )
                    ),
                10000
            )
            this.request('initialize', {
                ...clientInfo,
                extensionConfiguration: this.extensionConfigurationDuringInitialization,
            }).then(
                info => {
                    this.notify('initialized', null)
                    resolve(info)
                },
                error => reject(error)
            )
        })
    }

    private defultTestClientCapabilities: ClientCapabilities = {
        ...allClientCapabilitiesEnabled,
        secrets: 'stateless',
    }

    private getClientInfo(
        capabilities: ClientCapabilities = this.defultTestClientCapabilities
    ): ClientInfo {
        return {
            name: this.name,
            version: 'v1',
            workspaceRootUri: this.params.workspaceRootUri.toString(),
            workspaceRootPath: this.params.workspaceRootUri.fsPath,
            capabilities: {
                ...capabilities,
                secrets: capabilities.secrets ?? 'stateless',
            },
            extensionConfiguration: {
                anonymousUserID: `${this.name}abcde1234`,
                accessToken: this.params.credentials.token ?? this.params.credentials.redactedToken,
                serverEndpoint: this.params.credentials.serverEndpoint,
                customHeaders: {},
                customConfiguration: {
                    // For testing internal features.
                    'cody.internal.unstable': true,
                    // Symf is disabled for all agent integration tests because
                    // it makes the tests more stable.
                    'cody.experimental.symf.enabled': false,
                    ...this.params.extraConfiguration,
                },
                debug: false,
                verboseDebug: false,
                codebase: 'github.com/sourcegraph/cody',
            },
        }
    }
}

export function asTranscriptMessage(reply: ExtensionMessage): ExtensionTranscriptMessage {
    if (reply.type === 'transcript') {
        return reply
    }
    throw new Error(`expected transcript, got: ${JSON.stringify(reply)}`)
}

interface TextDocumentEventParams {
    text?: string
    selectionName?: string
    removeCursor?: boolean
    selection?: Range | undefined | null
}

function isPositionEqual(a: Position, b: Position): boolean {
    return a.line === b.line && a.character === b.character
}

interface TestInfo {
    // Test files "on disk" URI (not actually written about but uses "file" protocol)
    uri: vscode.Uri

    // Test content
    value: string
    fullFile: string

    // Was this an update to an exisiting test file or a new file
    isUpdate: boolean
}
