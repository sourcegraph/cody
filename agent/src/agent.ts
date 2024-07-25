import { spawn } from 'node:child_process'
import path from 'node:path'

import type { Polly, Request } from '@pollyjs/core'
import { type CodyCommand, ModelUsage, telemetryRecorder } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { StreamMessageReader, StreamMessageWriter, createMessageConnection } from 'vscode-jsonrpc/node'
import packageJson from '../../vscode/package.json'

import {
    type AuthStatus,
    type BillingCategory,
    type BillingProduct,
    FeatureFlag,
    ModelsService,
    PromptString,
    contextFiltersProvider,
    convertGitCloneURLToCodebaseName,
    featureFlagProvider,
    graphqlClient,
    isError,
    isFileURI,
    isRateLimitError,
    logDebug,
    logError,
    setUserAgent,
} from '@sourcegraph/cody-shared'
import type { TelemetryEventParameters } from '@sourcegraph/telemetry'

import { chatHistory } from '../../vscode/src/chat/chat-view/ChatHistoryManager'
import { ChatModel } from '../../vscode/src/chat/chat-view/ChatModel'
import type { ExtensionMessage, WebviewMessage } from '../../vscode/src/chat/protocol'
import { ProtocolTextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'
import type * as agent_protocol from '../../vscode/src/jsonrpc/agent-protocol'

import { mkdirSync, statSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import type { Har } from '@pollyjs/persister'
import { copySync } from 'fs-extra'
import levenshtein from 'js-levenshtein'
import * as uuid from 'uuid'
import type { MessageConnection } from 'vscode-jsonrpc'
import type { CommandResult } from '../../vscode/src/CommandResult'
import { loadTscRetriever } from '../../vscode/src/completions/context/retrievers/tsc/load-tsc-retriever'
import { supportedTscLanguages } from '../../vscode/src/completions/context/retrievers/tsc/supportedTscLanguages'
import type { CompletionItemID } from '../../vscode/src/completions/logger'
import { type ExecuteEditArguments, executeEdit } from '../../vscode/src/edit/execute'
import type { QuickPickInput } from '../../vscode/src/edit/input/get-input'
import { getModelOptionItems } from '../../vscode/src/edit/input/get-items/model'
import { getEditSmartSelection } from '../../vscode/src/edit/utils/edit-selection'
import type { ExtensionClient, ExtensionObjects } from '../../vscode/src/extension-client'
import { IndentationBasedFoldingRangeProvider } from '../../vscode/src/lsp/foldingRanges'
import type { FixupActor, FixupFileCollection } from '../../vscode/src/non-stop/roles'
import type { FixupControlApplicator } from '../../vscode/src/non-stop/strategies'
import { AgentWorkspaceEdit } from '../../vscode/src/testutils/AgentWorkspaceEdit'
import { emptyEvent } from '../../vscode/src/testutils/emptyEvent'
import { AgentFixupControls } from './AgentFixupControls'
import { AgentGlobalState } from './AgentGlobalState'
import { AgentProviders } from './AgentProviders'
import { AgentWebviewPanel, AgentWebviewPanels } from './AgentWebviewPanel'
import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'
import { registerNativeWebviewHandlers, resolveWebviewView } from './NativeWebview'
import type { PollyRequestError } from './cli/command-jsonrpc-stdio'
import { codyPaths } from './codyPaths'
import {
    MessageHandler,
    type RequestCallback,
    type RequestMethodName,
    type RpcMessageHandler,
} from './jsonrpc-alias'
import { getLanguageForFileName } from './language'
import type {
    AutocompleteItem,
    ClientInfo,
    CodyError,
    CustomCommandResult,
    EditTask,
    ExtensionConfiguration,
    GetDocumentsParams,
    GetDocumentsResult,
    GetFoldingRangeResult,
    ProtocolCommand,
    ProtocolTextDocument,
    TextEdit,
} from './protocol-alias'
import * as vscode_shim from './vscode-shim'
import { vscodeLocation, vscodeRange } from './vscode-type-converters'

const inMemorySecretStorageMap = new Map<string, string>()
const globalState = new AgentGlobalState()

/** The VS Code extension's `activate` function. */
type ExtensionActivate = (
    context: vscode.ExtensionContext,
    extensionClient?: ExtensionClient
) => Promise<unknown>

// In certs.js, we run `win-ca` to install self-signed certificates.  The
// `win-ca` package needs access to a "roots.exe" file, which we bundle
// alongside the agent as 'win-ca-roots.exe'. In VS Code, we use
// `vscode.ExtensionContext.extensionUri` to discover the location of this file.
// In the agent, we assume this file is placed next to the bundled `index.js`
// file, and we copy it over to the `extensionPath` so the VS Code logic works
// without changes.
function copyExtensionRelativeResources(extensionPath: string): void {
    const relativeSources = ['win-ca-roots.exe', 'webviews']
    for (const relativeSource of relativeSources) {
        const source = path.join(__dirname, relativeSource)
        const target = path.join(extensionPath, 'dist', relativeSource)
        try {
            const stat = statSync(source)
            if (!(stat.isFile() || stat.isDirectory())) {
                continue
            }
        } catch {
            logDebug('copyExtensionRelativeResources', `Failed to find ${source}, skipping copy`)
            return
        }
        try {
            mkdirSync(path.dirname(target), { recursive: true })
            copySync(source, target)
        } catch (err) {
            logDebug('copyExtensionRelativeResources', `Failed to copy ${source} to dist ${target}`, err)
        }
    }
}

export async function initializeVscodeExtension(
    workspaceRoot: vscode.Uri,
    extensionActivate: ExtensionActivate,
    extensionClient: ExtensionClient
): Promise<void> {
    const paths = codyPaths()
    const extensionPath = paths.config
    copyExtensionRelativeResources(extensionPath)

    const context: vscode.ExtensionContext = {
        asAbsolutePath(relativePath) {
            return path.resolve(workspaceRoot.fsPath, relativePath)
        },
        environmentVariableCollection: {} as any,
        extension: {} as any,
        extensionMode: {} as any,
        // Placeholder string values for extension path/uri. These are only used
        // to resolve paths to icon in the UI. They need to have compatible
        // types but don't have to point to a meaningful path/URI.
        extensionPath,
        extensionUri: vscode.Uri.file(paths.config),
        globalState,
        logUri: vscode.Uri.file(paths.log),
        logPath: paths.log,
        secrets: {
            onDidChange: emptyEvent(),
            get(key) {
                return Promise.resolve(inMemorySecretStorageMap.get(key))
            },
            store(key, value) {
                inMemorySecretStorageMap.set(key, value)
                return Promise.resolve()
            },
            delete() {
                return Promise.resolve()
            },
        },
        storageUri: vscode.Uri.file(paths.data),
        subscriptions: [],

        workspaceState: {} as any,
        globalStorageUri: vscode.Uri.file(paths.data),
        storagePath: paths.data,
        globalStoragePath: vscode.Uri.file(paths.data).fsPath,
    }

    await extensionActivate(context, extensionClient)
}

export async function newAgentClient(
    clientInfo: ClientInfo & {
        codyAgentPath?: string
        inheritStderr?: boolean
        extraEnvVariables?: Record<string, string>
    }
): Promise<InitializedClient> {
    const asyncHandler = async (reject: (reason?: any) => void): Promise<InitializedClient> => {
        const nodeArguments = process.argv0.endsWith('node')
            ? ['--enable-source-maps', ...process.argv.slice(1, 2)]
            : []
        nodeArguments.push('api', 'jsonrpc-stdio')
        const arg0 = clientInfo.codyAgentPath ?? process.argv[0]
        const args = clientInfo.codyAgentPath ? [] : nodeArguments
        const child = spawn(arg0, args, {
            env: {
                ...clientInfo.extraEnvVariables,
                ENABLE_SENTRY: 'false',
                ...process.env,
            },
        })
        child.on('error', error => reject?.(error))
        child.on('exit', code => {
            if (code !== 0) {
                reject?.(new Error(`exit: ${code}`))
            }
        })

        if (clientInfo.inheritStderr) {
            child.stderr.pipe(process.stderr)
        }

        const conn = createMessageConnection(
            new StreamMessageReader(child.stdout),
            new StreamMessageWriter(child.stdin)
        )
        const serverHandler = new MessageHandler(conn)
        serverHandler.registerNotification('debug/message', params => {
            console.error(`${params.channel}: ${params.message}`)
        })
        serverHandler.registerRequest('window/showMessage', async (params): Promise<null> => {
            console.log(`window/showMessage: ${JSON.stringify(params, null, 2)}`)
            return null
        })
        conn.listen()
        serverHandler.conn.onClose(() => reject())
        const serverInfo = await serverHandler.request('initialize', clientInfo)
        serverHandler.notify('initialized', null)
        return { client: serverHandler, serverInfo }
    }
    return new Promise<InitializedClient>((resolve, reject) => {
        asyncHandler(reject).then(
            handler => resolve(handler),
            error => reject(error)
        )
    })
}
export interface InitializedClient {
    serverInfo: agent_protocol.ServerInfo
    client: RpcMessageHandler
}

export async function newEmbeddedAgentClient(
    clientInfo: ClientInfo,
    extensionActivate: ExtensionActivate
): Promise<InitializedClient & { agent: Agent; messageHandler: MessageHandler }> {
    process.env.ENABLE_SENTRY = 'false'
    const serverToClient = new PassThrough()
    const clientToServer = new PassThrough()
    const serverConnection = createMessageConnection(
        new StreamMessageReader(clientToServer),
        new StreamMessageWriter(serverToClient)
    )
    const clientConnection = createMessageConnection(
        new StreamMessageReader(serverToClient),
        new StreamMessageWriter(clientToServer)
    )
    const agent = new Agent({ conn: serverConnection, extensionActivate })
    serverConnection.listen()
    const messageHandler = new MessageHandler(clientConnection)
    clientConnection.listen()
    agent.registerNotification('debug/message', params => {
        console.error(`${params.channel}: ${params.message}`)
    })
    const client = agent.clientForThisInstance()
    const serverInfo = await client.request('initialize', clientInfo)
    client.notify('initialized', null)
    return { agent, serverInfo, client, messageHandler }
}

export function errorToCodyError(error?: Error): CodyError | undefined {
    return error
        ? {
              message: error.message,
              stack: error.stack,
              cause: error.cause instanceof Error ? errorToCodyError(error.cause) : undefined,
          }
        : undefined
}

export class Agent extends MessageHandler implements ExtensionClient {
    // Used to track background work of the extension, like tree-sitter parsing.
    // In several places in the extension, we register event handler that run
    // background work (`Promise<void>` that we don't await on). We sometimes
    // need to await on these promises, for example when writing deterministic
    // tests.
    private pendingPromises = new Set<Promise<any>>()
    public codeLens = new AgentProviders<vscode.CodeLensProvider>()
    public codeAction = new AgentProviders<vscode.CodeActionProvider>()
    public workspace = new AgentWorkspaceDocuments({
        doPanic: (message: string) => {
            const panicMessage =
                '!PANIC! Client document content is out of sync with server document content'
            process.stderr.write(panicMessage)
            process.stderr.write(message + '\n')
            this.notify('debug/message', {
                channel: 'Document Sync Check',
                message: panicMessage + '\n' + message,
            })
        },
        edit: (uri, callback, options) => {
            if (this.clientInfo?.capabilities?.edit !== 'enabled') {
                logDebug('CodyAgent', 'client does not support operation: textDocument/edit')
                return Promise.resolve(false)
            }
            const edits: TextEdit[] = []
            callback({
                delete(location) {
                    edits.push({
                        type: 'delete',
                        range: location,
                    })
                },
                insert(location, value) {
                    edits.push({
                        type: 'insert',
                        position: location,
                        value,
                    })
                },
                replace(location, value) {
                    edits.push({
                        type: 'replace',
                        range:
                            location instanceof vscode.Position
                                ? new vscode.Range(location, location)
                                : location,
                        value,
                    })
                },
                setEndOfLine(): void {
                    throw new Error('Not implemented')
                },
            })
            return this.request('textDocument/edit', {
                uri: uri.toString(),
                edits,
                options,
            })
        },
    })

    public webPanels = new AgentWebviewPanels()
    public webviewViewProviders = new Map<string, vscode.WebviewViewProvider>()

    private authenticationPromise: Promise<AuthStatus | undefined> = Promise.resolve(undefined)

    private clientInfo: ClientInfo | null = null

    constructor(
        private readonly params: {
            polly?: Polly | undefined
            networkRequests?: Request[]
            requestErrors?: PollyRequestError[]
            conn: MessageConnection
            extensionActivate: ExtensionActivate
        }
    ) {
        super(params.conn)
        vscode_shim.setAgent(this)
        this.registerRequest('initialize', async clientInfo => {
            vscode.languages.registerFoldingRangeProvider(
                '*',
                new IndentationBasedFoldingRangeProvider()
            )
            if (clientInfo.extensionConfiguration?.baseGlobalState) {
                for (const key in clientInfo.extensionConfiguration.baseGlobalState) {
                    const value = clientInfo.extensionConfiguration.baseGlobalState[key]
                    globalState.update(key, value)
                }
            }
            this.workspace.workspaceRootUri = vscode.Uri.parse(clientInfo.workspaceRootUri)
            vscode_shim.setWorkspaceDocuments(this.workspace)
            if (clientInfo.capabilities?.codeActions === 'enabled') {
                vscode_shim.onDidRegisterNewCodeActionProvider(codeActionProvider => {
                    this.codeAction.addProvider(codeActionProvider, undefined)
                })
                vscode_shim.onDidUnregisterNewCodeActionProvider(codeActionProvider =>
                    this.codeAction.removeProvider(codeActionProvider)
                )
            }
            if (clientInfo.capabilities?.codeLenses === 'enabled') {
                vscode_shim.onDidRegisterNewCodeLensProvider(codeLensProvider => {
                    this.codeLens.addProvider(
                        codeLensProvider,
                        codeLensProvider.onDidChangeCodeLenses?.(() => this.updateCodeLenses())
                    )
                    this.updateCodeLenses()
                })
                vscode_shim.onDidUnregisterNewCodeLensProvider(codeLensProvider =>
                    this.codeLens.removeProvider(codeLensProvider)
                )
            }
            if (clientInfo.capabilities?.ignore === 'enabled') {
                contextFiltersProvider.onContextFiltersChanged(() => {
                    // Forward policy change notifications to the client.
                    this.notify('ignore/didChange', null)
                })
            }
            if (process.env.CODY_DEBUG === 'true') {
                console.error(
                    `Cody Agent: handshake with client '${clientInfo.name}' (version '${clientInfo.version}') at workspace root path '${clientInfo.workspaceRootUri}'\n`
                )
            }

            vscode_shim.setClientInfo(clientInfo)
            this.clientInfo = clientInfo
            setUserAgent(`${clientInfo?.name} / ${clientInfo?.version}`)

            this.workspace.workspaceRootUri = clientInfo.workspaceRootUri
                ? vscode.Uri.parse(clientInfo.workspaceRootUri)
                : vscode.Uri.from({
                      scheme: 'file',
                      path: clientInfo.workspaceRootPath ?? undefined,
                  })

            try {
                await initializeVscodeExtension(
                    this.workspace.workspaceRootUri,
                    params.extensionActivate,
                    this
                )

                const webviewCapabilities = clientInfo.capabilities?.webview
                const useNativeWebviews =
                    webviewCapabilities instanceof Object && webviewCapabilities.type === 'native'
                if (useNativeWebviews) {
                    registerNativeWebviewHandlers(
                        this,
                        vscode.Uri.file(codyPaths().config), // the extension root URI, for locating Webview resources
                        webviewCapabilities
                    )
                } else {
                    this.registerWebviewHandlers()
                }

                this.authenticationPromise = clientInfo.extensionConfiguration
                    ? this.handleConfigChanges(clientInfo.extensionConfiguration, {
                          forceAuthentication: true,
                      })
                    : this.authStatus()
                const authStatus = await this.authenticationPromise

                return {
                    name: 'cody-agent',
                    authenticated: authStatus?.authenticated,
                    codyEnabled: authStatus?.siteHasCodyEnabled,
                    codyVersion: authStatus?.siteVersion,
                    authStatus,
                }
            } catch (error) {
                console.error(
                    `Cody Agent: failed to initialize VSCode extension at workspace root path '${clientInfo.workspaceRootUri}': ${error}\n`
                )
                process.exit(1)
            }
        })

        this.registerNotification('initialized', () => {})

        this.registerRequest('shutdown', async () => {
            if (this?.params?.polly) {
                this.params.polly.disconnectFrom('node-http')
                await this.params.polly.stop()
            }
            return null
        })

        this.registerNotification('exit', () => {
            process.exit(0)
        })

        this.registerNotification('workspaceFolder/didChange', async params => {
            if (this.workspace.workspaceRootUri?.toString() !== params.uri) {
                const newWorkspaceUri = vscode.Uri.parse(params.uri)
                this.workspace.workspaceRootUri = newWorkspaceUri

                const currentWorkspaceFolders = vscode_shim.workspaceFolders ?? []
                const updatedWorkspaceFolders = vscode_shim.setWorkspaceFolders(newWorkspaceUri)

                this.pushPendingPromise(
                    vscode_shim.onDidChangeWorkspaceFolders.cody_fireAsync({
                        added: updatedWorkspaceFolders,
                        removed: currentWorkspaceFolders,
                    })
                )
            }
        })

        this.registerNotification('textDocument/didFocus', (document: ProtocolTextDocument) => {
            const documentWithUri = ProtocolTextDocumentWithUri.fromDocument(document)
            this.workspace.setActiveTextEditor(
                this.workspace.newTextEditor(this.workspace.loadDocument(documentWithUri))
            )
            this.pushPendingPromise(this.workspace.fireVisibleTextEditorsDidChange())
        })

        this.registerNotification('textDocument/didOpen', document => {
            const documentWithUri = ProtocolTextDocumentWithUri.fromDocument(document)
            const textDocument = this.workspace.loadDocument(documentWithUri)
            vscode_shim.onDidOpenTextDocument.fire(textDocument)
            this.pushPendingPromise(this.workspace.fireVisibleTextEditorsDidChange())
            this.workspace.setActiveTextEditor(this.workspace.newTextEditor(textDocument))
        })

        this.registerNotification('textDocument/didChange', async document => {
            this.handleDocumentChange(document)
        })

        this.registerRequest('textDocument/change', async document => {
            // We don't await the promise here, as it's got a fragile implicit contract.
            // Call testing/awaitPendingPromises if you want to wait for changes to settle.
            this.handleDocumentChange(document)
            return { success: true }
        })

        this.registerNotification('textDocument/didClose', document => {
            const documentWithUri = ProtocolTextDocumentWithUri.fromDocument(document)
            const oldDocument = this.workspace.getDocument(documentWithUri.uri)
            if (oldDocument) {
                this.workspace.deleteDocument(documentWithUri.uri)
                vscode_shim.onDidCloseTextDocument.fire(oldDocument)
            }
            this.pushPendingPromise(this.workspace.fireVisibleTextEditorsDidChange())
        })

        this.registerNotification('textDocument/didSave', async params => {
            const uri = vscode.Uri.parse(params.uri)
            const document = await this.workspace.openTextDocument(uri)
            vscode_shim.onDidSaveTextDocument.fire(document)
        })

        this.registerNotification('extensionConfiguration/didChange', config => {
            this.authenticationPromise = this.handleConfigChanges(config)
        })

        this.registerRequest('extensionConfiguration/change', async config => {
            this.authenticationPromise = this.handleConfigChanges(config)
            const result = await this.authenticationPromise
            return result ?? null
        })

        this.registerRequest('extensionConfiguration/status', async () => {
            const result = await this.authenticationPromise
            return result ?? null
        })

        this.registerRequest('extensionConfiguration/getSettingsSchema', async () => {
            return JSON.stringify({
                $schema: 'http://json-schema.org/draft-07/schema#',
                title: 'Schema for Cody settings in the Cody VSCode Extension.',
                description: 'This prevents invalid Cody specific configuration in the settings file.',
                type: 'object',
                allOf: [{ $ref: 'https://json.schemastore.org/package' }],
                properties: packageJson.contributes.configuration.properties,
            })
        })

        this.registerNotification('progress/cancel', ({ id }) => {
            const token = vscode_shim.progressBars.get(id)
            if (token) {
                token.cancel()
            } else {
                console.error(`progress/cancel: unknown ID ${id}`)
            }
        })

        // Store in-memory copy of the most recent Code action
        const codeActionById = new Map<string, vscode.CodeAction>()
        this.registerAuthenticatedRequest('codeActions/provide', async (params, token) => {
            codeActionById.clear()
            const document = this.workspace.getDocument(vscode.Uri.parse(params.location.uri))
            if (!document) {
                throw new Error(`codeActions/provide: document not found for ${params.location.uri}`)
            }
            const codeActions: agent_protocol.ProtocolCodeAction[] = []
            const diagnostics = vscode.languages.getDiagnostics(document.uri)
            for (const providers of this.codeAction.providers()) {
                const result = await providers.provideCodeActions(
                    document,
                    vscodeRange(params.location.range),
                    {
                        diagnostics,
                        only: undefined,
                        triggerKind:
                            params.triggerKind === 'Automatic'
                                ? vscode.CodeActionTriggerKind.Automatic
                                : vscode.CodeActionTriggerKind.Invoke,
                    },
                    token
                )
                for (const vscAction of result ?? []) {
                    if (vscAction instanceof vscode.CodeAction) {
                        const diagnostics: agent_protocol.ProtocolDiagnostic[] = []
                        for (const diagnostic of vscAction.diagnostics ?? []) {
                            diagnostics.push({
                                location: {
                                    uri: params.location.uri,
                                    range: diagnostic.range,
                                },
                                severity: 'error',
                                source: diagnostic.source,
                                message: diagnostic.message,
                            })
                        }
                        const id = uuid.v4()
                        const codeAction: agent_protocol.ProtocolCodeAction = {
                            id,
                            title: vscAction.title,
                            commandID: vscAction.command?.command,
                            diagnostics,
                        }
                        codeActionById.set(id, vscAction)
                        codeActions.push(codeAction)
                    }
                }
            }
            return { codeActions }
        })

        this.registerAuthenticatedRequest('codeActions/trigger', async ({ id }) => {
            const codeAction = codeActionById.get(id)
            if (!codeAction || !codeAction.command) {
                throw new Error(`codeActions/trigger: unknown ID ${id}`)
            }
            const args: ExecuteEditArguments = codeAction.command.arguments?.[0]
            if (!args) {
                throw new Error(`codeActions/trigger: no arguments for ID ${id}`)
            }
            return this.createEditTask(
                executeEdit(args).then<CommandResult | undefined>(task => ({
                    type: 'edit',
                    task,
                }))
            )
        })

        this.registerAuthenticatedRequest('diagnostics/publish', async params => {
            const result = new Map<string, vscode.Diagnostic[]>()
            for (const diagnostic of params.diagnostics) {
                let diagnostics = result.get(diagnostic.location.uri)
                if (diagnostics === undefined) {
                    diagnostics = []
                    result.set(diagnostic.location.uri, diagnostics)
                }
                const relatedInformation: vscode.DiagnosticRelatedInformation[] = []
                for (const related of diagnostic.relatedInformation ?? []) {
                    relatedInformation.push({
                        location: vscodeLocation(related.location),
                        message: related.message,
                    })
                }
                diagnostics.push({
                    message: diagnostic.message,
                    range: vscodeRange(diagnostic.location.range),
                    severity: vscode.DiagnosticSeverity.Error,
                    code: diagnostic.code ?? undefined,
                    source: diagnostic.source ?? undefined,
                    relatedInformation,
                })
            }
            vscode_shim.diagnostics.publish(result)
            return null
        })

        this.registerAuthenticatedRequest('testing/diagnostics', async params => {
            const uri = vscode.Uri.parse(params.uri)
            const language = getLanguageForFileName(uri.fsPath)
            const retriever = loadTscRetriever()
            if (!isFileURI(uri) || !supportedTscLanguages.has(language) || !retriever) {
                throw new Error(`testing/diagnostics: unsupported file type ${language} for URI ${uri}`)
            }
            const diagnostics = retriever.diagnostics(uri)
            return { diagnostics }
        })

        this.registerAuthenticatedRequest('testing/awaitPendingPromises', async () => {
            if (!(vscode_shim.isTesting || vscode_shim.isIntegrationTesting)) {
                throw new Error(
                    'testing/awaitPendingPromises can only be called from tests. ' +
                        'To fix this problem, set the environment variable CODY_SHIM_TESTING=true.'
                )
            }
            await Promise.all(this.pendingPromises.values())
            return null
        })

        this.registerAuthenticatedRequest('testing/memoryUsage', async () => {
            if (!global.gc) {
                throw new Error('testing/memoryUsage requires running node with --expose-gc')
            }
            global.gc()
            return { usage: process.memoryUsage() }
        })

        this.registerAuthenticatedRequest('testing/networkRequests', async () => {
            const requests = this.params.networkRequests ?? []
            return {
                requests: requests.map(req => ({ url: req.url, body: req.body })),
            }
        })
        this.registerAuthenticatedRequest('testing/closestPostData', async ({ url, postData }) => {
            const polly = this.params.polly
            let closestDistance = Number.MAX_VALUE
            let closest = ''
            if (!polly) {
                throw new Error('testing/closestPostData: Polly is not enabled')
            }
            // @ts-ignore
            const persister = polly.persister._cache as Map<string, Promise<Har>>
            for (const [, har] of persister) {
                for (const entry of (await har)?.log?.entries ?? []) {
                    if (entry.request.url !== url) {
                        continue
                    }
                    const entryPostData = entry.request.postData?.text ?? ''
                    const distance = levenshtein(postData, entryPostData)
                    if (distance < closestDistance) {
                        closest = entryPostData
                        closestDistance = distance
                    }
                }
            }
            return { closestBody: closest }
        })
        this.registerAuthenticatedRequest('testing/requestErrors', async () => {
            const requests = this.params.requestErrors ?? []
            return {
                errors: requests.map(({ request, error }) => ({
                    url: request.url,
                    error,
                })),
            }
        })
        this.registerAuthenticatedRequest('testing/progress', async ({ title }) => {
            const thenable = await vscode.window.withProgress(
                {
                    title: 'testing/progress',
                    location: vscode.ProgressLocation.Notification,
                    cancellable: true,
                },
                progress => {
                    progress.report({ message: 'message1' })
                    progress.report({ increment: 50 })
                    progress.report({ increment: 50 })
                    return Promise.resolve({ result: `Hello ${title}` })
                }
            )
            return thenable
        })

        this.registerAuthenticatedRequest('testing/progressCancelation', async ({ title }) => {
            const message = await vscode.window.withProgress<string>(
                {
                    title: 'testing/progressCancelation',
                    location: vscode.ProgressLocation.Notification,
                    cancellable: true,
                },
                (progress, token) => {
                    return new Promise<string>((resolve, reject) => {
                        token.onCancellationRequested(() => {
                            progress.report({
                                message: 'before resolution',
                            })
                            resolve(`request with title '${title}' cancelled`)
                            progress.report({
                                message: 'after resolution',
                            })
                        })
                        setTimeout(
                            () =>
                                reject(
                                    new Error(
                                        'testing/progressCancelation did not resolve within 5 seconds. ' +
                                            'To fix this problem, send a progress/cancel notification with the same ID ' +
                                            'as the progress/start notification with title "testing/progressCancelation"'
                                    )
                                ),
                            5_000
                        )
                    })
                }
            )
            return { result: message }
        })

        this.registerAuthenticatedRequest('testing/reset', async () => {
            await this.workspace.reset()
            globalState.reset()
            return null
        })

        this.registerAuthenticatedRequest(
            'testing/workspaceDocuments',
            async (params: GetDocumentsParams): Promise<GetDocumentsResult> => {
                const uris = params?.uris ?? this.workspace.allDocuments().map(doc => doc.uri.toString())

                const documents: ProtocolTextDocument[] = []

                for (const uri of uris) {
                    const document = this.workspace.getDocument(vscode.Uri.parse(uri))
                    if (document) {
                        documents.push({
                            uri: document.uri.toString(),
                            content: document.content ?? undefined,
                            selection: document.protocolDocument?.selection ?? undefined,
                        })
                    }
                }
                return { documents }
            }
        )

        this.registerAuthenticatedRequest('command/execute', async params => {
            await vscode.commands.executeCommand(params.command, ...(params.arguments ?? []))
        })

        this.registerAuthenticatedRequest('customCommands/list', async () => {
            const commands = await vscode.commands.executeCommand('cody.commands.get-custom-commands')
            return (commands as CodyCommand[]) ?? []
        })

        this.registerAuthenticatedRequest('testing/autocomplete/completionEvent', async params => {
            const provider = await vscode_shim.completionProvider()

            return provider.getTestingCompletionEvent(params.completionID as CompletionItemID)
        })

        this.registerAuthenticatedRequest('autocomplete/execute', async (params, token) => {
            const provider = await vscode_shim.completionProvider()
            if (!provider) {
                logError('Agent', 'autocomplete/execute', 'Completion provider is not initialized')
                return { items: [] }
            }
            const uri =
                typeof params.uri === 'string'
                    ? vscode.Uri.parse(params.uri)
                    : params?.filePath
                      ? vscode.Uri.file(params.filePath)
                      : undefined
            if (!uri) {
                logError(
                    'Agent',
                    'autocomplete/execute',
                    `No uri provided for autocomplete request ${JSON.stringify(
                        params
                    )}. To fix this problem, set the 'uri' property.`
                )
                return { items: [] }
            }
            const document = this.workspace.getDocument(uri)
            if (!document) {
                logError(
                    'Agent',
                    'autocomplete/execute',
                    'No document found for file path',
                    params.uri,
                    [...this.workspace.allUris()]
                )
                return { items: [] }
            }

            try {
                if (params.triggerKind === 'Invoke') {
                    await provider?.manuallyTriggerCompletion?.()
                }

                const result = await provider.provideInlineCompletionItems(
                    document,
                    new vscode.Position(params.position.line, params.position.character),
                    {
                        triggerKind:
                            vscode.InlineCompletionTriggerKind[params.triggerKind ?? 'Automatic'],
                        selectedCompletionInfo:
                            params.selectedCompletionInfo?.text === undefined ||
                            params.selectedCompletionInfo?.text === null
                                ? undefined
                                : {
                                      text: params.selectedCompletionInfo.text,
                                      range: new vscode.Range(
                                          params.selectedCompletionInfo.range.start.line,
                                          params.selectedCompletionInfo.range.start.character,
                                          params.selectedCompletionInfo.range.end.line,
                                          params.selectedCompletionInfo.range.end.character
                                      ),
                                  },
                    },
                    token
                )

                const items: AutocompleteItem[] =
                    result?.items.flatMap(({ insertText, range, id }) =>
                        typeof insertText === 'string' && range !== undefined
                            ? [{ id, insertText, range }]
                            : []
                    ) ?? []

                return { items, completionEvent: result?.completionEvent }
            } catch (error) {
                if (isRateLimitError(error)) {
                    throw error
                }
                return Promise.reject(error)
            }
        })

        this.registerNotification('autocomplete/completionAccepted', async ({ completionID }) => {
            const provider = await vscode_shim.completionProvider()
            await provider.handleDidAcceptCompletionItem(completionID as CompletionItemID)
        })

        this.registerNotification('autocomplete/completionSuggested', async ({ completionID }) => {
            const provider = await vscode_shim.completionProvider()
            provider.unstable_handleDidShowCompletionItem(completionID as CompletionItemID)
        })

        this.registerAuthenticatedRequest('graphql/getRepoIds', async ({ names, first }) => {
            const repos = await graphqlClient.getRepoIds(names, first)
            if (isError(repos)) {
                throw repos
            }
            return { repos }
        })
        this.registerAuthenticatedRequest('graphql/currentUserId', async () => {
            const id = await graphqlClient.getCurrentUserId()
            if (typeof id === 'string') {
                return id
            }

            throw id
        })

        this.registerAuthenticatedRequest('graphql/currentUserIsPro', async () => {
            const res = await graphqlClient.getCurrentUserCodyProEnabled()
            if (res instanceof Error) {
                throw res
            }

            return res.codyProEnabled
        })

        this.registerAuthenticatedRequest('graphql/getCurrentUserCodySubscription', async () => {
            const res = await graphqlClient.getCurrentUserCodySubscription()
            if (res instanceof Error) {
                throw res
            }

            return res
        })

        this.registerAuthenticatedRequest('telemetry/recordEvent', async event => {
            telemetryRecorder.recordEvent(
                // 👷 HACK: We have no control over what gets sent over JSON RPC,
                // so we depend on client implementations to give type guidance
                // to ensure that we don't accidentally share arbitrary,
                // potentially sensitive string values. In this RPC handler,
                // when passing the provided event to the TelemetryRecorder
                // implementation, we forcibly cast all the inputs below
                // (feature, action, parameters) into known types (strings
                // 'feature', 'action', 'key') so that the recorder will accept
                // it. DO NOT do this elsewhere!
                event.feature as 'feature',
                event.action as 'action',
                event.parameters as TelemetryEventParameters<
                    { key: number },
                    BillingProduct,
                    BillingCategory
                >
            )
            return Promise.resolve(null)
        })

        /**
         * @deprecated use 'telemetry/recordEvent' instead.
         */
        this.registerAuthenticatedRequest('graphql/logEvent', async event => {
            if (typeof event.argument === 'object') {
                event.argument = JSON.stringify(event.argument)
            }
            if (typeof event.publicArgument === 'object') {
                event.publicArgument = JSON.stringify(event.publicArgument)
            }
            await graphqlClient.logEvent(event, 'connected-instance-only')
            return null
        })

        this.registerRequest('graphql/getRepoIdIfEmbeddingExists', () => {
            return Promise.resolve(null)
        })

        this.registerRequest('graphql/getRepoId', async ({ repoName }) => {
            const result = await graphqlClient.getRepoId(repoName)
            if (result instanceof Error) {
                console.error('getRepoId', result)
            }
            return typeof result === 'string' ? result : null
        })

        this.registerAuthenticatedRequest('git/codebaseName', ({ url }) => {
            const result = convertGitCloneURLToCodebaseName(url)
            return Promise.resolve(typeof result === 'string' ? result : null)
        })

        this.registerNotification('autocomplete/clearLastCandidate', async () => {
            const provider = await vscode_shim.completionProvider()
            if (!provider) {
                console.log('Completion provider is not initialized: unable to clear last candidate')
            }
            provider.clearLastCandidate()
        })

        this.registerAuthenticatedRequest('webview/didDispose', ({ id }) => {
            const panel = this.webPanels.panels.get(id)
            if (!panel) {
                console.log(`No panel with id ${id} found`)
                return Promise.resolve(null)
            }
            panel.dispose()
            return Promise.resolve(null)
        })

        // The arguments to pass to the command to make sure edit commands would also run in chat mode
        const commandArgs = [{ source: 'editor' }]

        this.registerAuthenticatedRequest('commands/explain', () => {
            return this.createChatPanel(
                vscode.commands.executeCommand('cody.command.explain-code', commandArgs)
            )
        })

        this.registerAuthenticatedRequest('commands/test', () => {
            return this.createChatPanel(
                vscode.commands.executeCommand('cody.command.generate-tests', commandArgs)
            )
        })

        this.registerAuthenticatedRequest('editCommands/test', () => {
            return this.createEditTask(
                vscode.commands.executeCommand<CommandResult | undefined>('cody.command.unit-tests')
            )
        })

        this.registerAuthenticatedRequest('editTask/accept', async ({ id }) => {
            this.fixups?.accept(id)
            return null
        })

        this.registerAuthenticatedRequest('editTask/undo', async ({ id }) => {
            this.fixups?.undo(id)
            return null
        })

        this.registerAuthenticatedRequest('editTask/cancel', async ({ id }) => {
            this.fixups?.cancel(id)
            return null
        })

        this.registerAuthenticatedRequest('editTask/getTaskDetails', async ({ id }) => {
            const task = this.fixups?.getTask(id)
            if (task) {
                return AgentFixupControls.serialize(task)
            }

            return Promise.reject(`No task with id ${id}`)
        })

        this.registerAuthenticatedRequest('editTask/retry', params => {
            const instruction = PromptString.unsafe_fromUserQuery(params.instruction)
            const models = getModelOptionItems(ModelsService.getModels(ModelUsage.Edit), true)
            const previousInput: QuickPickInput = {
                instruction: instruction,
                userContextFiles: [],
                model: models.find(item => item.modelTitle === params.model)?.model ?? models[0].model,
                range: vscodeRange(params.range),
                intent: 'edit',
                mode: params.mode,
            }

            if (!this.fixups) return Promise.reject()
            const retryResult = this.fixups.retry(params.id, previousInput)
            return this.createEditTask(retryResult.then(task => task && { type: 'edit', task }))
        })

        this.registerAuthenticatedRequest(
            'editTask/getFoldingRanges',
            async (params): Promise<GetFoldingRangeResult> => {
                const uri = vscode.Uri.parse(params.uri)
                const vscodeRange = new vscode.Range(
                    params.range.start.line,
                    params.range.start.character,
                    params.range.end.line,
                    params.range.end.character
                )
                const document = this.workspace.getDocument(uri)
                if (!document) {
                    logError(
                        'Agent',
                        'editTask/getFoldingRanges',
                        'No document found for file path',
                        params.uri,
                        [...this.workspace.allUris()]
                    )
                    return Promise.resolve({ range: vscodeRange })
                }
                const range = await getEditSmartSelection(document, vscodeRange, {})
                return { range }
            }
        )

        this.registerAuthenticatedRequest('editCommands/code', params => {
            const instruction = PromptString.unsafe_fromUserQuery(params.instruction)
            const args: ExecuteEditArguments = {
                configuration: {
                    instruction,
                    model: params.model ?? undefined,
                    mode: params.mode ?? 'edit',
                },
            }
            return this.createEditTask(executeEdit(args).then(task => task && { type: 'edit', task }))
        })

        this.registerAuthenticatedRequest('editCommands/document', () => {
            return this.createEditTask(
                vscode.commands.executeCommand<CommandResult | undefined>('cody.command.document-code')
            )
        })

        this.registerAuthenticatedRequest('commands/smell', () => {
            return this.createChatPanel(
                vscode.commands.executeCommand('cody.command.smell-code', commandArgs)
            )
        })

        this.registerAuthenticatedRequest('commands/custom', ({ key }) => {
            return this.executeCustomCommand(
                vscode.commands.executeCommand<CommandResult | undefined>(
                    'cody.action.command',
                    key,
                    commandArgs
                )
            )
        })

        this.registerAuthenticatedRequest('chat/new', async () => {
            return this.createChatPanel(
                Promise.resolve({
                    type: 'chat',
                    session: await vscode.commands.executeCommand('cody.chat.newEditorPanel'),
                })
            )
        })

        this.registerAuthenticatedRequest('chat/web/new', async () => {
            await vscode.commands.executeCommand('cody.chat.newEditorPanel')
            return { panelId: 'TODO-remove-panel-id', chatId: 'TODO-remove-chat-id' }
        })

        // TODO: JetBrains no longer uses this, consider deleting it.
        this.registerAuthenticatedRequest('chat/restore', async ({ modelID, messages, chatID }) => {
            const authStatus = await vscode.commands.executeCommand<AuthStatus>('cody.auth.status')
            modelID ??= ModelsService.getDefaultChatModel() ?? ''
            const chatMessages = messages?.map(PromptString.unsafe_deserializeChatMessage) ?? []
            const chatModel = new ChatModel(modelID, chatID, chatMessages)
            await chatHistory.saveChat(authStatus, chatModel.toSerializedChatTranscript())
            return this.createChatPanel(
                Promise.resolve({
                    type: 'chat',
                    session: await vscode.commands.executeCommand('cody.chat.panel.restore', [chatID]),
                })
            )
        })

        this.registerAuthenticatedRequest('chat/models', async ({ modelUsage }) => {
            const models = ModelsService.getModels(modelUsage)
            return { models }
        })

        this.registerAuthenticatedRequest('chat/export', async input => {
            const { fullHistory = false } = input ?? {}
            const authStatus = await vscode.commands.executeCommand<AuthStatus>('cody.auth.status')
            const localHistory = chatHistory.getLocalHistory(authStatus)

            if (localHistory != null) {
                return (
                    Object.entries(localHistory?.chat)
                        // Return filtered (non-empty) chats by default, but if requests has fullHistory: true
                        // return the full list of chats from the storage, empty chats included
                        .filter(
                            ([_, chatTranscript]) =>
                                chatTranscript.interactions.length > 0 || fullHistory
                        )
                        .map(([chatID, chatTranscript]) => ({
                            chatID: chatID,
                            transcript: chatTranscript,
                        }))
                )
            }

            return []
        })

        this.registerAuthenticatedRequest('chat/delete', async params => {
            await vscode.commands.executeCommand<AuthStatus>('cody.chat.history.delete', {
                id: params.chatId,
            })

            const authStatus = await vscode.commands.executeCommand<AuthStatus>('cody.auth.status')
            const localHistory = await chatHistory.getLocalHistory(authStatus)

            if (localHistory != null) {
                return Object.entries(localHistory?.chat).map(([chatID, chatTranscript]) => ({
                    chatID: chatID,
                    transcript: chatTranscript,
                }))
            }

            return []
        })

        this.registerAuthenticatedRequest('chat/remoteRepos', async ({ id }) => {
            const panel = this.webPanels.getPanelOrError(id)
            await this.receiveWebviewMessage(id, {
                command: 'context/get-remote-search-repos',
            })
            return { remoteRepos: panel.remoteRepos }
        })

        const submitOrEditHandler = async (
            { id, message }: { id: string; message: WebviewMessage },
            token: vscode.CancellationToken
        ): Promise<ExtensionMessage> => {
            if (message.command !== 'submit' && message.command !== 'edit') {
                throw new Error('Invalid message, must have a command of "submit"')
            }
            const panel = this.webPanels.getPanelOrError(id)
            if (panel.isMessageInProgress) {
                throw new Error('Message is already in progress')
            }
            const disposables: vscode.Disposable[] = []
            const result = new Promise<ExtensionMessage>((resolve, reject) => {
                disposables.push(
                    panel.onMessageInProgressDidChange(message => {
                        if (message.type === 'transcript' && !message.isMessageInProgress) {
                            resolve(message)
                        } else if (message.type !== 'transcript') {
                            reject(
                                new Error(
                                    `expected transcript message, received ${JSON.stringify(message)}`
                                )
                            )
                        }
                    })
                )
                this.receiveWebviewMessage(id, message).then(
                    () => {},
                    error => reject(error)
                )
                disposables.push(
                    token.onCancellationRequested(() => {
                        this.receiveWebviewMessage(id, {
                            command: 'abort',
                        }).then(
                            () => {},
                            error => reject(error)
                        )
                    })
                )
            })

            // TODO: capture a rate-limit error if submitting this message triggered the rate limit

            return result.finally(() => {
                vscode.Disposable.from(...disposables).dispose()
            })
        }
        this.registerAuthenticatedRequest('chat/submitMessage', submitOrEditHandler)
        this.registerAuthenticatedRequest('chat/editMessage', submitOrEditHandler)

        this.registerAuthenticatedRequest('webview/resolveWebviewView', async params => {
            await this.resolveWebviewView(params)
            return null
        })
        this.registerNotification('webview/didDisposeNative', async ({ handle }) => {
            await this.didDisposeNativeWebview(handle)
        })
        this.registerAuthenticatedRequest('webview/receiveMessage', async ({ id, message }) => {
            await this.receiveWebviewMessage(id, message)
            return null
        })
        this.registerAuthenticatedRequest(
            'webview/receiveMessageStringEncoded',
            async ({ id, messageStringEncoded }) => {
                await this.receiveWebviewMessage(id, JSON.parse(messageStringEncoded))
                return null
            }
        )

        this.registerAuthenticatedRequest('featureFlags/getFeatureFlag', async ({ flagName }) => {
            return featureFlagProvider.evaluateFeatureFlag(
                FeatureFlag[flagName as keyof typeof FeatureFlag]
            )
        })

        this.registerAuthenticatedRequest('attribution/search', async ({ id, snippet }) => {
            const panel = this.webPanels.getPanelOrError(id)
            await this.receiveWebviewMessage(id, {
                command: 'attribution-search',
                snippet,
            })
            const result = panel.popAttribution(snippet)
            return {
                error: result.error || null,
                repoNames: result?.attribution?.repositoryNames || [],
                limitHit: result?.attribution?.limitHit || false,
            }
        })

        this.registerAuthenticatedRequest('remoteRepo/has', async ({ repoName }, cancelToken) => {
            return {
                result: await this.extension.enterpriseContextFactory.repoSearcher.has(repoName),
            }
        })

        this.registerAuthenticatedRequest('remoteRepo/list', async ({ query, first, afterId }) => {
            const result = await this.extension.enterpriseContextFactory.repoSearcher.list(
                query ?? undefined,
                first,
                afterId ?? undefined
            )
            return {
                repos: result.repos,
                startIndex: result.startIndex,
                count: result.count,
                state: {
                    state: result.state,
                    error: errorToCodyError(result.lastError),
                },
            }
        })

        this.registerAuthenticatedRequest('ignore/test', async ({ uri: uriString }) => {
            const uri = vscode.Uri.parse(uriString)
            const isIgnored = await contextFiltersProvider.isUriIgnored(uri)
            return {
                policy: isIgnored ? 'ignore' : 'use',
            } as const
        })

        this.registerAuthenticatedRequest('testing/ignore/overridePolicy', async contextFilters => {
            contextFiltersProvider.setTestingContextFilters(contextFilters)
            return null
        })
    }

    private pushPendingPromise(pendingPromise: Promise<unknown>): void {
        if (vscode_shim.isTesting || vscode_shim.isIntegrationTesting) {
            this.pendingPromises.add(pendingPromise)
            pendingPromise.finally(() => this.pendingPromises.delete(pendingPromise))
        }
    }

    // ExtensionClient callbacks.

    private fixups: AgentFixupControls | undefined

    public createFixupControlApplicator(
        files: FixupActor & FixupFileCollection
    ): FixupControlApplicator {
        this.fixups = new AgentFixupControls(files, this.notify.bind(this))
        return this.fixups
    }

    public openNewDocument = async (
        _: typeof vscode.workspace,
        uri: vscode.Uri
    ): Promise<vscode.TextDocument | undefined> => {
        if (uri.scheme !== 'untitled') {
            return vscode_shim.workspace.openTextDocument(uri)
        }

        if (this.clientInfo?.capabilities?.untitledDocuments !== 'enabled') {
            const errorMessage =
                'Client does not support untitled documents. To fix this problem, set `untitledDocuments: "enabled"` in client capabilities'
            logError('Agent', 'unsupported operation', errorMessage)
            throw new Error(errorMessage)
        }

        const result = await this.request('textDocument/openUntitledDocument', {
            uri: uri.toString(),
        })
        return result ? vscode_shim.workspace.openTextDocument(result.uri) : undefined
    }

    private maybeExtension: ExtensionObjects | undefined

    public async provide(extension: ExtensionObjects): Promise<vscode.Disposable> {
        this.maybeExtension = extension

        const disposables: vscode.Disposable[] = []

        const repoSearcher = this.extension.enterpriseContextFactory.repoSearcher
        disposables.push(
            repoSearcher.onFetchStateChanged(({ state, error }) => {
                this.notify('remoteRepo/didChangeState', {
                    state,
                    error: errorToCodyError(error),
                })
            }),
            repoSearcher.onRepoListChanged(() => {
                this.notify('remoteRepo/didChange', null)
            }),
            {
                dispose: () => {
                    this.maybeExtension = undefined
                },
            }
        )

        return vscode.Disposable.from(...disposables)
    }

    get clientName(): string {
        return this.clientInfo?.name.toLowerCase() || 'uninitialized-agent'
    }

    get clientVersion(): string {
        return this.clientInfo?.version || '0.0.0'
    }

    get capabilities(): agent_protocol.ClientCapabilities | undefined {
        return this.clientInfo?.capabilities ?? undefined
    }

    /**
     * Gets provided extension objects. This may only be called after
     * registration is complete.
     */
    private get extension(): ExtensionObjects {
        if (!this.maybeExtension) {
            throw new Error('Extension registration not yet complete')
        }
        return this.maybeExtension
    }

    private codeLensToken = new vscode.CancellationTokenSource()
    /**
     * Matches VS Code codicon syntax, e.g. $(cody-logo)
     * Source: https://sourcegraph.com/github.com/microsoft/vscode@f34d4/-/blob/src/vs/base/browser/ui/iconLabel/iconLabels.ts?L9
     */
    private labelWithIconsRegex = /(\\)?\$\(([A-Za-z0-9-]+(?:~[A-Za-z]+)?)\)/g
    /**
     * Given a title, such as "$(cody-logo) Cody", returns the raw
     * title without icons and the icons matched with their respective positions.
     */
    private splitIconsFromTitle(title: string): ProtocolCommand['title'] {
        const icons: { value: string; position: number }[] = []
        const matches = [...title.matchAll(this.labelWithIconsRegex)]

        for (const match of matches) {
            if (match.index !== undefined) {
                icons.push({ value: match[0], position: match.index })
            }
        }

        return { text: title.replace(this.labelWithIconsRegex, ''), icons }
    }

    private async updateCodeLenses(): Promise<void> {
        const uri = this.workspace.activeDocumentFilePath
        if (!uri) {
            return
        }
        const document = this.workspace.getDocument(uri)
        if (!document) {
            return
        }
        this.codeLensToken.cancel()
        this.codeLensToken = new vscode.CancellationTokenSource()
        const promises: Promise<vscode.CodeLens[]>[] = []
        for (const provider of this.codeLens.providers()) {
            promises.push(this.provideCodeLenses(provider, document))
        }
        const lenses = (await Promise.all(promises)).flat()

        // VS Code supports icons in code lenses, but we cannot render these through agent.
        // We need to strip any icons from the title and provide those seperately, so the client can decide how to render them.
        const agentLenses = lenses.map(lens => {
            if (!lens.command) {
                return {
                    ...lens,
                    command: undefined,
                }
            }

            return {
                ...lens,
                command: {
                    ...lens.command,
                    title: this.splitIconsFromTitle(lens.command.title),
                },
            }
        })

        this.notify('codeLenses/display', {
            uri: uri.toString(),
            codeLenses: agentLenses,
        })
    }
    private async provideCodeLenses(
        provider: vscode.CodeLensProvider,
        document: vscode.TextDocument
    ): Promise<vscode.CodeLens[]> {
        const result = await provider.provideCodeLenses(document, this.codeLensToken.token)
        return result ?? []
    }

    private async handleConfigChanges(
        config: ExtensionConfiguration,
        params?: { forceAuthentication: boolean }
    ): Promise<AuthStatus | undefined> {
        const isAuthChange = vscode_shim.isAuthenticationChange(config)
        vscode_shim.setExtensionConfiguration(config)
        // If this is an authentication change we need to reauthenticate prior to firing events
        // that update the clients
        if (isAuthChange || params?.forceAuthentication) {
            try {
                const authStatus = await vscode_shim.commands.executeCommand<AuthStatus | undefined>(
                    'cody.agent.auth.authenticate',
                    [config]
                )
                // Critical: we need to await for the handling of `onDidChangeConfiguration` to
                // let the new credentials propagate. If we remove the statement below, then
                // autocomplete may return empty results because we can't await for the updated
                // `InlineCompletionItemProvider` to register.
                await vscode_shim.onDidChangeConfiguration.cody_fireAsync({
                    affectsConfiguration: () =>
                        // assuming the return value below only impacts performance (not
                        // functionality), we return true to always triggger the callback.
                        true,
                })
                // await new Promise<void>(resolve => setTimeout(resolve, 3_000))
                // TODO(#56621): JetBrains: persistent chat history:
                // This is a temporary workaround to ensure that a new chat panel is created and properly initialized after the auth change.
                this.webPanels.panels.clear()
                return authStatus
            } catch (error) {
                console.log('Authentication failed', error)
            }
        }
        return this.authStatus()
    }

    private async authStatus(): Promise<AuthStatus | undefined> {
        // Do explicit `await` because `executeCommand()` returns `Thenable`.
        const result = await vscode_shim.commands.executeCommand<AuthStatus | undefined>(
            'cody.auth.status'
        )
        return result
    }

    private async handleDocumentChange(document: ProtocolTextDocument) {
        const documentWithUri = ProtocolTextDocumentWithUri.fromDocument(document)
        const { document: textDocument, contentChanges } =
            this.workspace.loadDocumentWithChanges(documentWithUri)
        const textEditor = this.workspace.newTextEditor(textDocument)
        this.workspace.setActiveTextEditor(textEditor)

        if (contentChanges.length > 0) {
            this.pushPendingPromise(
                vscode_shim.onDidChangeTextDocument.cody_fireAsync({
                    document: textDocument,
                    contentChanges,
                    reason: undefined,
                })
            )
        }
        if (document.selection) {
            this.pushPendingPromise(
                vscode_shim.onDidChangeTextEditorSelection.cody_fireAsync({
                    textEditor,
                    kind: undefined,
                    selections: [textEditor.selection],
                })
            )
        }
    }

    private registerWebviewHandlers(): void {
        vscode_shim.setCreateWebviewPanel((viewType, title, showOptions, options) => {
            const panel = new AgentWebviewPanel(viewType, title, showOptions, options)
            this.webPanels.add(panel)

            panel.onDidPostMessage(message => {
                if (message.type === 'transcript') {
                    panel.chatID = message.chatID
                    for (const chatMessage of message.messages) {
                        if (chatMessage?.error?.retryAfterDate) {
                            // HACK: for some reason, `JSON.stringify()` on the
                            // date class introduced JSON-RPC parse errors in
                            // the JetBrains plugin. This solution shouldn't be
                            // necessary because `JSON.stringify()` does convert
                            // dates into string literals, but it unblocked the
                            // JetBrains plugin from updating to the new chat
                            // UI. If changing this, at least manually confirm that
                            // it works OK to get rate limit errors in JetBrains.
                            chatMessage.error.retryAfterDateString = JSON.stringify(
                                chatMessage.error.retryAfterDate
                            )
                            chatMessage.error.retryAfterDate = undefined
                        }
                    }
                    if (panel.isMessageInProgress !== message.isMessageInProgress) {
                        panel.isMessageInProgress = message.isMessageInProgress
                        panel.messageInProgressChange.fire(message)
                    }
                } else if (message.type === 'chatModels') {
                    panel.models = message.models
                } else if (message.type === 'context/remote-repos') {
                    panel.remoteRepos = message.repos
                } else if (message.type === 'errors') {
                    panel.messageInProgressChange.fire(message)
                } else if (message.type === 'attribution') {
                    panel.pushAttribution({
                        ...message,
                        attribution: message.attribution ?? undefined,
                        error: message.error ?? undefined,
                    })
                }

                if (this.clientInfo?.capabilities?.webviewMessages === 'string-encoded') {
                    this.notify('webview/postMessageStringEncoded', {
                        id: panel.panelID,
                        stringEncodedMessage: JSON.stringify(message),
                    })
                } else {
                    this.notify('webview/postMessage', {
                        id: panel.panelID,
                        message,
                    })
                }
            })

            return panel
        })
    }

    private async resolveWebviewView({
        viewId,
        webviewHandle,
    }: { viewId: string; webviewHandle: string }): Promise<void> {
        const provider = this.webviewViewProviders.get(viewId)
        if (!provider) {
            return
        }
        await resolveWebviewView(provider, viewId, webviewHandle)
    }

    private async didDisposeNativeWebview(handle: string) {
        this.webPanels.nativePanels.get(handle)?.didDispose()
    }

    private async receiveWebviewMessage(id: string, message: WebviewMessage): Promise<void> {
        const nativePanel = this.webPanels.nativePanels.get(id)
        if (nativePanel) {
            nativePanel.didReceiveMessage(message)
            return
        }

        const panel = this.webPanels.panels.get(id)
        if (!panel) {
            console.log(`No panel with id ${id} found`)
            return
        }
        await panel.receiveMessage.cody_fireAsync(message)
    }

    private async createEditTask(commandResult: Thenable<CommandResult | undefined>): Promise<EditTask> {
        const result = (await commandResult) ?? { type: 'empty-command-result' }
        if (result?.type !== 'edit' || result.task === undefined) {
            throw new TypeError(
                `Expected a non-empty edit command result. Got ${JSON.stringify(result)}`
            )
        }
        return AgentFixupControls.serialize(result.task)
    }

    private async createChatPanel(commandResult: Thenable<CommandResult | undefined>): Promise<string> {
        const result = (await commandResult) ?? { type: 'empty-command-result' }
        if (result?.type !== 'chat') {
            throw new TypeError(`Expected chat command result, got ${result.type}`)
        }

        const { sessionID, webviewPanelOrView: webviewPanel } = result.session ?? {}
        if (sessionID === undefined || webviewPanel === undefined) {
            throw new Error('chatID is undefined')
        }
        if (!(webviewPanel instanceof AgentWebviewPanel)) {
            // TODO: For WebViews we don't want to throw here, nor do we want to set chatID
            // on the returned object.
            throw new TypeError('')
        }

        if (webviewPanel.chatID === undefined) {
            webviewPanel.chatID = sessionID
        }
        if (sessionID !== webviewPanel.chatID) {
            throw new TypeError(
                `Mismatching chatID, (sessionID) ${sessionID} !== ${webviewPanel.chatID} (webviewPanel.chatID)`
            )
        }
        webviewPanel.initialize()
        return webviewPanel.panelID
    }

    private async executeCustomCommand(
        commandResult: Thenable<CommandResult | undefined>
    ): Promise<CustomCommandResult> {
        const result = (await commandResult) ?? { type: 'empty-command-result' }

        if (result?.type === 'chat') {
            return {
                type: 'chat',
                chatResult: await this.createChatPanel(commandResult),
            }
        }

        if (result?.type === 'edit') {
            return {
                type: 'edit',
                editResult: await this.createEditTask(commandResult),
            }
        }

        throw new Error('Invalid custom command result')
    }

    // Alternative to `registerRequest` that awaits on authentication changes to
    // propagate before calling the method handler.
    public registerAuthenticatedRequest<M extends RequestMethodName>(
        method: M,
        callback: RequestCallback<M>
    ): void {
        this.registerRequest(method, async (params, token) => {
            await this.authenticationPromise
            if (vscode_shim.isTesting) {
                await Promise.all(this.pendingPromises.values())
            }
            return callback(params, token)
        })
    }

    public applyWorkspaceEdit(
        edit: vscode.WorkspaceEdit,
        metadata: vscode.WorkspaceEditMetadata | undefined
    ): Promise<boolean> {
        if (edit instanceof AgentWorkspaceEdit) {
            if (this.clientInfo?.capabilities?.editWorkspace === 'enabled') {
                return this.request('workspace/edit', {
                    operations: edit.operations,
                    metadata,
                })
            }
            logError(
                'Agent',
                'client does not support vscode.workspace.applyEdit() yet. ' +
                    'If you are a client author, enable this operation by setting ' +
                    'the client capability `editWorkspace: "enabled"`',
                new Error().stack // adding the stack trace to help debugging by this method is being called
            )
            return Promise.resolve(false)
        }

        throw new TypeError(`Expected AgentWorkspaceEdit, got ${edit}`)
    }
}
