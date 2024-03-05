import assert from 'assert'

import { createPatch } from 'diff'

import { type ChildProcessWithoutNullStreams, spawn } from 'child_process'
import os from 'os'
import path from 'path'
import { type ChatMessage, type ContextItem, logError } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { applyPatch } from 'fast-myers-diff'
import fspromises from 'fs/promises'
import * as vscode from 'vscode'
import { Uri } from 'vscode'
import type { ExtensionMessage, ExtensionTranscriptMessage } from '../../vscode/src/chat/protocol'
import { doesFileExist } from '../../vscode/src/commands/utils/workspace-files'
import { ProtocolTextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'
import { CodyTaskState } from '../../vscode/src/non-stop/utils'
import { AgentTextDocument } from './AgentTextDocument'
import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'
import { MessageHandler, type NotificationMethodName } from './jsonrpc-alias'
import type {
    ClientInfo,
    CreateFileOperation,
    DebugMessage,
    DeleteFileOperation,
    EditTask,
    ExtensionConfiguration,
    NetworkRequest,
    ProgressReportParams,
    ProgressStartParams,
    ProtocolCodeLens,
    RenameFileOperation,
    ServerInfo,
    ShowWindowMessageParams,
    TextDocumentEditParams,
    WebviewPostMessageParams,
    WorkspaceEditParams,
} from './protocol-alias'
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

export class TestClient extends MessageHandler {
    public info: ClientInfo
    public agentProcess?: ChildProcessWithoutNullStreams
    // Array of all raw `progress/*` notification. Typed as `any` because
    // start/end/report have different types.
    public progressMessages: ProgressMessage[] = []
    public progressIDs = new Map<string, number>()
    public progressStartEvents = new vscode.EventEmitter<ProgressStartParams>()
    public readonly name: string
    public readonly serverEndpoint: string
    public readonly accessToken?: string
    public workspace = new AgentWorkspaceDocuments()
    public workspaceEditParams: WorkspaceEditParams[] = []

    constructor(
        private readonly params: {
            readonly name: string
            readonly accessToken?: string
            serverEndpoint?: string
            telemetryExporter?: 'testing' | 'graphql' // defaults to testing, which doesn't send telemetry
            featureFlags?: 'enabled' // defaults to testing, which doesn't send telemetry
            logEventMode?: 'connected-instance-only' | 'all' | 'dotcom-only'
            onWindowRequest?: (params: ShowWindowMessageParams) => Promise<string>
        }
    ) {
        super()
        this.serverEndpoint = params.serverEndpoint ?? 'https://sourcegraph.com'

        this.name = params.name
        this.accessToken = params.accessToken
        this.info = this.getClientInfo()

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
            const deletedFiles: DeleteFileOperation[] = []
            const renamedFiles: RenameFileOperation[] = []
            const createdFiles: CreateFileOperation[] = []
            for (const operation of params.operations) {
                if (operation.type === 'edit-file') {
                    const { success, protocolDocument } = this.editDocument(operation)
                    result ||= success
                    if (protocolDocument) {
                        this.notify('textDocument/didChange', protocolDocument.underlying)
                    }
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
                } else if (operation.type === 'delete-file') {
                    if (!(await doesFileExist(vscode.Uri.parse(operation.uri)))) {
                        result = false
                        continue
                    }
                    await fspromises.unlink(vscode.Uri.file(operation.uri).fsPath)
                    deletedFiles.push(operation)
                } else if (operation.type === 'rename-file') {
                    if (!(await doesFileExist(vscode.Uri.parse(operation.oldUri)))) {
                        continue
                    }
                    const newFileExists = await doesFileExist(vscode.Uri.parse(operation.newUri))
                    if (operation.options?.ignoreIfExists && newFileExists) {
                        continue
                    }
                    if (!operation.options?.overwrite && newFileExists) {
                        logError(
                            'workspace/edit',
                            "can't rename into new URI that already exists and options.overwrite=false",
                            operation.newUri
                        )
                        continue
                    }
                    const newPath = vscode.Uri.file(operation.newUri).fsPath
                    await fspromises.mkdir(path.dirname(newPath), { recursive: true })
                    await fspromises.rename(vscode.Uri.file(operation.oldUri).fsPath, newPath)
                    renamedFiles.push(operation)
                }
            }

            if (createdFiles.length > 0) {
                this.notify('workspace/didCreateFiles', { files: createdFiles })
            }

            if (deletedFiles.length > 0) {
                this.notify('workspace/didDeleteFiles', { files: deletedFiles })
            }

            if (renamedFiles.length > 0) {
                this.notify('workspace/didRenameFiles', { files: renamedFiles })
            }

            return result
        })
        this.registerRequest('textDocument/openUntitledDocument', params => {
            this.workspace.addDocument(ProtocolTextDocumentWithUri.fromDocument(params))
            this.notify('textDocument/didOpen', params)
            return Promise.resolve(true)
        })
        this.registerRequest('textDocument/edit', params => {
            return Promise.resolve(this.editDocument(params).success)
        })
        this.registerRequest('textDocument/show', () => {
            return Promise.resolve(true)
        })
        this.registerNotification('debug/message', message => {
            this.logMessage(message)
        })
    }

    private editDocument(params: TextDocumentEditParams): {
        success: boolean
        protocolDocument?: ProtocolTextDocumentWithUri
    } {
        const document = this.workspace.getDocument(vscode.Uri.parse(params.uri))
        if (!document) {
            logError('textDocument/edit: document not found', params.uri)
            return { success: false }
        }
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
        this.workspace.addDocument(protocolDocument)
        return { success: true, protocolDocument }
    }
    private logMessage(params: DebugMessage): void {
        // Uncomment below to see `logDebug` messages.
        // console.log(`${params.channel}: ${params.message}`)
    }

    public openFile(
        uri: Uri,
        params?: { selectionName?: string; removeCursor?: boolean }
    ): Promise<void> {
        return this.textDocumentEvent(uri, 'textDocument/didOpen', params)
    }
    public changeFile(
        uri: Uri,
        params?: { selectionName?: string; removeCursor?: boolean }
    ): Promise<void> {
        return this.textDocumentEvent(uri, 'textDocument/didChange', params)
    }

    public async textDocumentEvent(
        uri: Uri,
        method: NotificationMethodName,
        params?: { selectionName?: string; removeCursor?: boolean }
    ): Promise<void> {
        const selectionName = params?.selectionName ?? 'SELECTION'
        let content: string = (await doesFileExist(uri))
            ? await fspromises.readFile(uri.fsPath, 'utf8')
            : ''
        const selectionStartMarker = `/* ${selectionName}_START */`
        const selectionStart = content.indexOf(selectionStartMarker)
        const selectionEnd = content.indexOf(`/* ${selectionName}_END */`)
        const cursor = content.indexOf('/* CURSOR */')
        if (selectionStart < 0 && selectionEnd < 0 && params?.selectionName) {
            throw new Error(`No selection found for name ${params.selectionName}`)
        }
        if (params?.removeCursor ?? true) {
            content = content.replace('/* CURSOR */', '')
        }

        const document = AgentTextDocument.from(uri, content)
        const start =
            cursor >= 0
                ? document.positionAt(cursor)
                : selectionStart >= 0
                  ? document.positionAt(selectionStart + selectionStartMarker.length)
                  : undefined
        const end =
            cursor >= 0 ? start : selectionEnd >= 0 ? document.positionAt(selectionEnd) : undefined
        const protocolDocument = {
            uri: uri.toString(),
            content,
            selection: start && end ? { start, end } : undefined,
        }
        this.workspace.addDocument(ProtocolTextDocumentWithUri.fromDocument(protocolDocument))
        this.notify(method, protocolDocument)
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

    /**
     * Promise that resolves when the provided task has reached the 'applied' state.
     */
    public taskHasReachedAppliedPhase(params: EditTask): Promise<void> {
        switch (params.state) {
            case CodyTaskState.applied:
                return Promise.resolve()
            case CodyTaskState.finished:
            case CodyTaskState.error:
                return Promise.reject(
                    new Error(`Task reached terminal state before being applied ${params}`)
                )
        }

        let disposable: vscode.Disposable
        return new Promise<void>((resolve, reject) => {
            disposable = this.onDidChangeTaskState(({ id, state, error }) => {
                if (id === params.id) {
                    switch (state) {
                        case CodyTaskState.applied:
                            return resolve()
                        case CodyTaskState.error:
                        case CodyTaskState.finished:
                            return reject(
                                new Error(
                                    `Task reached terminal state before being applied ${JSON.stringify({
                                        id,
                                        state: CodyTaskState[state],
                                        error,
                                    })}`
                                )
                            )
                    }
                }
            })
        }).finally(() => disposable.dispose())
    }

    public codeLenses = new Map<string, ProtocolCodeLens[]>()
    public newTaskState = new vscode.EventEmitter<EditTask>()
    public onDidChangeTaskState = this.newTaskState.event
    public webviewMessages: WebviewPostMessageParams[] = []
    public webviewMessagesEmitter = new vscode.EventEmitter<WebviewPostMessageParams>()

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
        this.agentProcess = this.spawnAgentProcess()

        this.connectProcess(this.agentProcess, error => {
            console.error(error)
        })
        this.registerNotification('editTaskState/didChange', params => {
            this.newTaskState.fire(params)
        })

        this.registerNotification('webview/postMessage', params => {
            this.webviewMessages.push(params)
            this.webviewMessagesEmitter.fire(params)
        })

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

    public async setChatModel(id: string, model: string): Promise<void> {
        await this.request('webview/receiveMessage', {
            id,
            message: { command: 'chatModel', model },
        })
    }

    public async reset(id: string): Promise<void> {
        await this.request('webview/receiveMessage', {
            id,
            message: { command: 'reset' },
        })
    }

    public async editMessage(
        id: string,
        text: string,
        params?: { addEnhancedContext?: boolean; contextFiles?: ContextItem[]; index?: number }
    ): Promise<ChatMessage | undefined> {
        const reply = asTranscriptMessage(
            await this.request('chat/editMessage', {
                id,
                message: {
                    command: 'edit',
                    text,
                    index: params?.index,
                    contextFiles: params?.contextFiles ?? [],
                    addEnhancedContext: params?.addEnhancedContext ?? false,
                },
            })
        )
        return reply.messages.at(-1)
    }

    public async sendMessage(
        id: string,
        text: string,
        params?: { addEnhancedContext?: boolean; contextFiles?: ContextItem[] }
    ): Promise<ChatMessage | undefined> {
        return (await this.sendSingleMessageToNewChatWithFullTranscript(text, { ...params, id }))
            ?.lastMessage
    }

    public async sendSingleMessageToNewChat(
        text: string,
        params?: { addEnhancedContext?: boolean; contextFiles?: ContextItem[] }
    ): Promise<ChatMessage | undefined> {
        return (await this.sendSingleMessageToNewChatWithFullTranscript(text, params))?.lastMessage
    }

    public async sendSingleMessageToNewChatWithFullTranscript(
        text: string,
        params?: { addEnhancedContext?: boolean; contextFiles?: ContextItem[]; id?: string }
    ): Promise<{ lastMessage?: ChatMessage; panelID: string; transcript: ExtensionTranscriptMessage }> {
        const id = params?.id ?? (await this.request('chat/new', null))
        const reply = asTranscriptMessage(
            await this.request('chat/submitMessage', {
                id,
                message: {
                    command: 'submit',
                    text,
                    submitType: 'user',
                    addEnhancedContext: params?.addEnhancedContext ?? false,
                    contextFiles: params?.contextFiles,
                },
            })
        )
        return { panelID: id, transcript: reply, lastMessage: reply.messages.at(-1) }
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
            const oldChange = JSON.stringify(body, null, 2)
            const newChange = JSON.stringify(JSON.parse(closestBody), null, 2)
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
                    'the closest matchin recording in the recording file.'
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

    public async shutdownAndExit() {
        if (this.isAlive()) {
            const { errors } = await this.request('testing/requestErrors', null)
            const missingRecordingErrors = errors.filter(({ error }) =>
                error?.includes?.('`recordIfMissing` is')
            )
            if (missingRecordingErrors.length > 0) {
                for (const error of missingRecordingErrors) {
                    await this.printDiffAgainstClosestMatchingRecording(error)
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
            console.log('Agent has already exited')
        }
    }

    public getAgentDir(): string {
        const cwd = process.cwd()
        return path.basename(cwd) === 'agent' ? cwd : path.join(cwd, 'agent')
    }

    private async handshake(
        clientInfo: ClientInfo,
        additionalConfig?: Partial<ExtensionConfiguration>
    ): Promise<ServerInfo> {
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
                extensionConfiguration: {
                    serverEndpoint: 'https://invalid',
                    accessToken: 'invalid',
                    customHeaders: {},
                    ...clientInfo.extensionConfiguration,
                    ...additionalConfig,
                },
            }).then(
                info => {
                    this.notify('initialized', null)
                    resolve(info)
                },
                error => reject(error)
            )
        })
    }

    private spawnAgentProcess() {
        const agentDir = this.getAgentDir()
        const recordingDirectory = path.join(agentDir, 'recordings')
        const agentScript = path.join(agentDir, 'dist', 'index.js')

        return spawn('node', ['--enable-source-maps', agentScript, 'jsonrpc'], {
            stdio: 'pipe',
            cwd: agentDir,
            env: {
                CODY_SHIM_TESTING: 'true',
                CODY_TEMPERATURE_ZERO: 'true',
                CODY_RECORDING_MODE: 'replay', // can be overwritten with process.env.CODY_RECORDING_MODE
                CODY_RECORDING_DIRECTORY: recordingDirectory,
                CODY_RECORDING_NAME: this.name,
                SRC_ACCESS_TOKEN: this.accessToken,
                CODY_TELEMETRY_EXPORTER: this.params.telemetryExporter ?? 'testing',
                BENCHMARK_DISABLE_FEATURE_FLAGS:
                    this.params.featureFlags === 'enabled' ? undefined : 'true',
                CODY_LOG_EVENT_MODE: this.params.logEventMode,
                ...process.env,
            },
        })
    }

    private getClientInfo(): ClientInfo {
        const workspaceRootUri = Uri.file(path.join(os.tmpdir(), 'cody-vscode-shim-test'))

        return {
            name: this.name,
            version: 'v1',
            workspaceRootUri: workspaceRootUri.toString(),
            workspaceRootPath: workspaceRootUri.fsPath,
            capabilities: {
                progressBars: 'enabled',
                edit: 'enabled',
                editWorkspace: 'enabled',
                untitledDocuments: 'enabled',
                showDocument: 'enabled',
                codeLenses: 'enabled',
                showWindowMessage: 'request',
            },
            extensionConfiguration: {
                anonymousUserID: `${this.name}abcde1234`,
                accessToken: this.accessToken ?? 'sgp_RRRRRRRREEEEEEEDDDDDDAAACCCCCTEEEEEEEDDD',
                serverEndpoint: this.serverEndpoint,
                customHeaders: {},
                autocompleteAdvancedProvider: 'anthropic',
                customConfiguration: {
                    'cody.autocomplete.experimental.graphContext': null,
                    // For testing .cody/ignore
                    'cody.internal.unstable': true,
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
