import { spawn } from 'node:child_process'
import path from 'node:path'

import type { Polly, Request } from '@pollyjs/core'
import {
    type AccountKeyedChatHistory,
    type ChatHistoryKey,
    type ClientCapabilities,
    ClientConfigSingleton,
    type CodyCommand,
    CodyIDE,
    currentAuthStatus,
    currentAuthStatusAuthed,
    firstNonPendingAuthStatus,
    firstResultFromOperation,
    getAuthHeaders,
    isDotCom,
    resolvedConfig,
    telemetryRecorder,
    waitUntilComplete,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { StreamMessageReader, StreamMessageWriter, createMessageConnection } from 'vscode-jsonrpc/node'
import packageJson from '../../vscode/package.json'

import { mkdirSync, statSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import type { Har } from '@pollyjs/persister'
import {
    type AuthStatus,
    type BillingCategory,
    type BillingProduct,
    FeatureFlag,
    contextFiltersProvider,
    convertGitCloneURLToCodebaseName,
    featureFlagProvider,
    graphqlClient,
    isError,
    isFileURI,
    isRateLimitError,
    logDebug,
    logError,
    modelsService,
} from '@sourcegraph/cody-shared'
import { codyPaths } from '@sourcegraph/cody-shared'
import { TESTING_TELEMETRY_EXPORTER } from '@sourcegraph/cody-shared/src/telemetry-v2/TelemetryRecorderProvider'
import { type TelemetryEventParameters, TestTelemetryExporter } from '@sourcegraph/telemetry'
import { copySync } from 'fs-extra'
import levenshtein from 'js-levenshtein'
import * as uuid from 'uuid'
import type { MessageConnection } from 'vscode-jsonrpc'
import type { ChatCommandResult, CommandResult, EditCommandResult } from '../../vscode/src/CommandResult'
import { formatURL } from '../../vscode/src/auth/auth'
import type { AutoeditRequestID } from '../../vscode/src/autoedits/analytics-logger'
import { chatHistory } from '../../vscode/src/chat/chat-view/ChatHistoryManager'
import type { ExtensionMessage, WebviewMessage } from '../../vscode/src/chat/protocol'
import { executeExplainCommand, executeSmellCommand } from '../../vscode/src/commands/execute'
import type { CodyCommandArgs } from '../../vscode/src/commands/types'
import type { CompletionItemID } from '../../vscode/src/completions/analytics-logger'
import { loadTscRetriever } from '../../vscode/src/completions/context/retrievers/tsc/load-tsc-retriever'
import { supportedTscLanguages } from '../../vscode/src/completions/context/retrievers/tsc/supportedTscLanguages'
import { type ExecuteEditArguments, executeEdit } from '../../vscode/src/edit/execute'
import { getEditSmartSelection } from '../../vscode/src/edit/utils/edit-selection'
import type { ExtensionClient } from '../../vscode/src/extension-client'
import { ProtocolTextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'
import type * as agent_protocol from '../../vscode/src/jsonrpc/agent-protocol'
import { IndentationBasedFoldingRangeProvider } from '../../vscode/src/lsp/foldingRanges'
import type { FixupTask } from '../../vscode/src/non-stop/FixupTask'
import type { FixupActor, FixupFileCollection } from '../../vscode/src/non-stop/roles'
import type { FixupControlApplicator } from '../../vscode/src/non-stop/strategies'
import { authProvider } from '../../vscode/src/services/AuthProvider'
import { localStorage } from '../../vscode/src/services/LocalStorageProvider'
import { AgentWorkspaceEdit } from '../../vscode/src/testutils/AgentWorkspaceEdit'
import { AgentAuthHandler } from './AgentAuthHandler'
import { AgentFixupControls } from './AgentFixupControls'
import { AgentProviders } from './AgentProviders'
import { AgentClientManagedSecretStorage, AgentStatelessSecretStorage } from './AgentSecretStorage'
import { AgentWebviewPanel, AgentWebviewPanels } from './AgentWebviewPanel'
import { AgentWorkspaceConfiguration } from './AgentWorkspaceConfiguration'
import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'
import { registerNativeWebviewHandlers, resolveWebviewView } from './NativeWebview'
import type { PollyRequestError } from './cli/command-jsonrpc-stdio'
import { toProtocolAuthStatus } from './currentProtocolAuthStatus'
import { AgentGlobalState } from './global-state/AgentGlobalState'
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
    ExtensionConfiguration,
    GetDocumentsParams,
    GetDocumentsResult,
    GetFoldingRangeResult,
    ProtocolTextDocument,
    TextEdit,
} from './protocol-alias'
import * as vscode_shim from './vscode-shim'
import { vscodeLocation, vscodeRange } from './vscode-type-converters'

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
function copyExtensionRelativeResources(extensionPath: string, extensionClient: ExtensionClient): void {
    const copySources = (relativeSource: string): void => {
        const source = path.join(__dirname, relativeSource)
        const target = path.join(extensionPath, 'dist', relativeSource)
        try {
            const stat = statSync(source)
            if (!(stat.isFile() || stat.isDirectory())) {
                return
            }
        } catch {
            logDebug('copyExtensionRelativeResources', `Failed to find ${source}, skipping copy`)
            return
        }
        try {
            mkdirSync(path.dirname(target), { recursive: true })
            // This is preferred over node:fs.copyFileSync because fs-extra's use of graceful-fs
            // handles certain timing failures on windows machines.
            copySync(source, target)
        } catch (err) {
            logDebug('copyExtensionRelativeResources', `Failed to copy ${source} to dist ${target}`, err)
        }
    }
    copySources('win-ca-roots.exe')
    // Only copy the files if the client is using the native webview and they haven't opted
    // to manage the resource files themselves.
    if (
        extensionClient.capabilities?.webview === 'native' &&
        !extensionClient.capabilities?.webviewNativeConfig?.skipResourceRelativization
    ) {
        copySources('webviews')
    }
}

async function initializeVscodeExtension(
    extensionActivate: ExtensionActivate,
    extensionClient: ExtensionClient,
    globalState: AgentGlobalState,
    secrets: vscode.SecretStorage
): Promise<void> {
    const paths = codyPaths()
    const extensionPath = paths.config
    const extensionUri = vscode.Uri.file(extensionPath)
    copyExtensionRelativeResources(extensionPath, extensionClient)

    const context: vscode.ExtensionContext = {
        asAbsolutePath(relativePath) {
            // From the docs (https://code.visualstudio.com/api/references/vscode-api):
            // > Note that an absolute uri can be constructed via Uri.joinPath and extensionUri,
            // > e.g. vscode.Uri.joinPath(context.extensionUri, relativePath);
            return vscode.Uri.joinPath(extensionUri, relativePath).toString()
        },
        environmentVariableCollection: {} as any,
        extension: {} as any,
        extensionMode: {} as any,
        // Placeholder string values for extension path/uri. These are only used
        // to resolve paths to icon in the UI. They need to have compatible
        // types but don't have to point to a meaningful path/URI.
        extensionPath,
        extensionUri,
        globalState,
        logUri: vscode.Uri.file(paths.log),
        logPath: paths.log,
        secrets,
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
interface InitializedClient {
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
        agent: this,
        doPanic: (message: string) => {
            const panicMessage =
                '!PANIC! Client document content is out of sync with server document content'
            process.stderr.write(panicMessage)
            process.stderr.write(message + '\n')
            this.notify('debug/message', {
                channel: 'Document Sync Check',
                message: panicMessage + '\n' + message,
                level: 'error',
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
    private secretsDidChange = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>()

    public webPanels = new AgentWebviewPanels()
    public webviewViewProviders = new Map<string, vscode.WebviewViewProvider>()

    public authenticationHandler: AgentAuthHandler | null = null

    private clientInfo: ClientInfo | null = null

    private globalState: AgentGlobalState | null = null

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
            this.globalState = await this.newGlobalState(clientInfo)

            if (clientInfo.capabilities && clientInfo.capabilities?.webview === undefined) {
                // Make it possible to do `capabilities.webview === 'agentic'`
                clientInfo.capabilities.webview = 'agentic'
            }

            if (clientInfo.extensionConfiguration?.baseGlobalState) {
                for (const key in clientInfo.extensionConfiguration.baseGlobalState) {
                    const value = clientInfo.extensionConfiguration.baseGlobalState[key]
                    this.globalState?.update(key, value)
                }
            }

            vscode_shim.setWorkspaceDocuments(this.workspace)
            if (clientInfo.workspaceRootUri) {
                vscode_shim.setLastOpenedWorkspaceFolder(vscode.Uri.parse(clientInfo.workspaceRootUri))
            } else if (clientInfo.workspaceRootPath) {
                vscode_shim.setLastOpenedWorkspaceFolder(
                    vscode.Uri.from({ scheme: 'file', path: clientInfo.workspaceRootPath })
                )
            }

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
                    this.codeLens.addProvider(codeLensProvider)
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
            if (clientInfo.capabilities?.authentication === 'enabled') {
                this.authenticationHandler = new AgentAuthHandler()
            }
            if (process.env.CODY_DEBUG === 'true') {
                console.error(
                    `Cody Agent: handshake with client '${clientInfo.name}' (version '${clientInfo.version}') at workspace root path '${clientInfo.workspaceRootUri}'\n`
                )
            }

            vscode_shim.setClientInfo(clientInfo)
            this.clientInfo = clientInfo

            try {
                const secrets =
                    clientInfo.capabilities?.secrets === 'client-managed'
                        ? new AgentClientManagedSecretStorage(this, this.secretsDidChange)
                        : new AgentStatelessSecretStorage({
                              [formatURL(clientInfo.extensionConfiguration?.serverEndpoint ?? '') ?? '']:
                                  clientInfo.extensionConfiguration?.accessToken ?? undefined,
                          })

                await initializeVscodeExtension(
                    params.extensionActivate,
                    this,
                    this.globalState,
                    secrets
                )

                const ideType = AgentWorkspaceConfiguration.clientNameToIDE(this.clientInfo?.name ?? '')

                const forceAuthentication =
                    !!clientInfo.extensionConfiguration &&
                    (!!clientInfo.extensionConfiguration?.accessToken || ideType === CodyIDE.Web)

                const webviewKind = clientInfo.capabilities?.webview || 'agentic'
                const nativeWebviewConfig = clientInfo.capabilities?.webviewNativeConfig
                if (webviewKind === 'native') {
                    if (!nativeWebviewConfig) {
                        throw new Error(
                            'client configured with webview "native" must set webviewNativeConfig'
                        )
                    }
                    registerNativeWebviewHandlers(
                        this,
                        vscode.Uri.file(codyPaths().config + '/dist'),
                        nativeWebviewConfig
                    )
                } else {
                    this.registerWebviewHandlers()
                }

                const status = clientInfo.extensionConfiguration
                    ? await this.handleConfigChanges(clientInfo.extensionConfiguration, {
                          forceAuthentication,
                      })
                    : await firstNonPendingAuthStatus()

                return {
                    name: 'cody-agent',
                    authenticated: status.authenticated,
                    authStatus: toProtocolAuthStatus(status),
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

        this.registerNotification('workspaceFolder/didChange', async ({ uris }) => {
            // We need to make a copy of the current workspaceFolders array because
            // setWorkspaceFolders mutates workspaceFolders.
            const oldWorkspaceFolders = vscode_shim.workspaceFolders.slice()
            const newWorkspaceFolders = vscode_shim.setWorkspaceFolders(
                uris.map(uri => vscode.Uri.parse(uri))
            )

            const added = newWorkspaceFolders.filter(
                newWf =>
                    !oldWorkspaceFolders.some(oldWf => oldWf.uri.toString() === newWf.uri.toString())
            )
            const removed = oldWorkspaceFolders.filter(
                oldWf =>
                    !newWorkspaceFolders.some(newWf => newWf.uri.toString() === oldWf.uri.toString())
            )

            this.pushPendingPromise(
                vscode_shim.onDidChangeWorkspaceFolders.cody_fireAsync({ added, removed })
            )
        })

        this.registerNotification('window/didChangeFocus', state => {
            this.pushPendingPromise(vscode_shim.onDidChangeWindowState.cody_fireAsync(state))
            Object.assign(vscode_shim.window.state, state)
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
            return this.handleDocumentChange(document).then(() => {
                return { success: true }
            })
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

        this.registerNotification('textDocument/didRename', params => {
            const oldUri = vscode.Uri.parse(params.oldUri)
            const newUri = vscode.Uri.parse(params.newUri)
            this.workspace.renameDocument(oldUri, newUri)
            vscode_shim.onDidRenameFiles.fire({ files: [{ oldUri, newUri }] })
        })

        this.registerNotification('extensionConfiguration/didChange', config => {
            this.handleConfigChanges(config)
        })

        this.registerNotification('testing/runInAgent', scenario => {
            try {
                if (scenario === 'configuration-test-configuration-update') {
                    // Execute the configuration update in the agent process where agent is defined
                    const configuration = vscode_shim.workspace.getConfiguration()
                    configuration.update('cody.dummy.setting', 'random')
                }
            } catch (error) {
                console.error('Error in testing/runInAgent:', error)
            }
        })

        this.registerRequest('extensionConfiguration/change', async config => {
            return this.handleConfigChanges(config).then(toProtocolAuthStatus)
        })

        this.registerRequest('extensionConfiguration/status', async () => {
            return firstNonPendingAuthStatus().then(toProtocolAuthStatus)
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
                                    uri: document.uri.toString(),
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

        this.registerAuthenticatedRequest('codeActions/trigger', async id => {
            const codeAction = codeActionById.get(id)
            if (!codeAction || !codeAction.command) {
                throw new Error(`codeActions/trigger: unknown ID ${id}`)
            }
            const args: ExecuteEditArguments = codeAction.command.arguments?.[0]
            if (!args) {
                throw new Error(`codeActions/trigger: no arguments for ID ${id}`)
            }
            return executeEdit(args)
                .then<EditCommandResult | undefined>(task => ({
                    type: 'edit',
                    task,
                }))
                .then(result => result?.task?.id)
        })

        this.registerAuthenticatedRequest('diagnostics/publish', async params => {
            const result = new Map<vscode_shim.UriString, vscode.Diagnostic[]>()
            for (const diagnostic of params.diagnostics) {
                const location = vscodeLocation(diagnostic.location)

                const diagnostics = result.get(vscode_shim.UriString.fromUri(location.uri)) ?? []

                const relatedInformation: vscode.DiagnosticRelatedInformation[] = []
                for (const related of diagnostic.relatedInformation ?? []) {
                    relatedInformation.push({
                        location: vscodeLocation(related.location),
                        message: related.message,
                    })
                }
                diagnostics.push({
                    message: diagnostic.message,
                    range: location.range,
                    severity: vscode.DiagnosticSeverity.Error,
                    code: diagnostic.code ?? undefined,
                    source: diagnostic.source ?? undefined,
                    relatedInformation,
                })
                //this ensures it's added to the map if it didn't already
                result.set(vscode_shim.UriString.fromUri(location.uri), diagnostics)
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

        this.registerAuthenticatedRequest('testing/heapdump', async () => {
            return await vscode.commands.executeCommand('cody.debug.heapDump')
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
        this.registerAuthenticatedRequest('testing/exportedTelemetryEvents', async () => {
            const events = TESTING_TELEMETRY_EXPORTER.getExported()
            return {
                events: events.map(event => ({
                    feature: event.feature,
                    action: event.action,
                    source: {
                        client: event.source.client,
                        clientVersion: event.source.clientVersion ?? '',
                    },
                    timestamp: event.timestamp,
                    parameters: {
                        metadata: event.parameters.metadata ?? {},
                        privateMetadata: event.parameters.privateMetadata ?? {},
                        billingMetadata: {
                            product: event.parameters.billingMetadata?.product ?? '',
                            category: event.parameters.billingMetadata?.category ?? '',
                        },
                    },
                    testOnlyAnonymousUserID: event.testOnlyAnonymousUserID,
                })),
            }
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
            await this.globalState?.reset()
            // reset the telemetry recorded events
            TESTING_TELEMETRY_EXPORTER.reset()
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
        TESTING_TELEMETRY_EXPORTER.delegate = new TestTelemetryExporter()

        this.registerAuthenticatedRequest('command/execute', async params => {
            await vscode.commands.executeCommand(params.command, ...(params.arguments ?? []))
        })

        this.registerAuthenticatedRequest('customCommands/list', async () => {
            const commands = await vscode.commands.executeCommand('cody.commands.get-custom-commands')
            return (commands as CodyCommand[]) ?? []
        })

        this.registerAuthenticatedRequest('testing/autocomplete/completionEvent', async params => {
            const provider = await vscode_shim.completionProvider()
            if (!('getTestingCompletionEvent' in provider)) {
                console.warn('Provider does not support getTestingCompletionEvent')
                return null
            }
            return provider.getTestingCompletionEvent(params.completionID as CompletionItemID)
        })

        this.registerAuthenticatedRequest('testing/autocomplete/autoeditEvent', async params => {
            const provider = await vscode_shim.completionProvider()
            if (!('getTestingAutoeditEvent' in provider)) {
                console.warn('Provider does not support getTestingAutoeditEvent')
                return null
            }
            return provider.getTestingAutoeditEvent(params.completionID as AutoeditRequestID)
        })

        this.registerAuthenticatedRequest('autocomplete/execute', async (params, token) => {
            const provider = await vscode_shim.completionProvider()
            if (!provider) {
                logError('Agent', 'autocomplete/execute', 'Completion provider is not initialized')
                return { items: [], inlineCompletionItems: [], decoratedEditItems: [] }
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
                return { items: [], inlineCompletionItems: [], decoratedEditItems: [] }
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
                return { items: [], inlineCompletionItems: [], decoratedEditItems: [] }
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

                if (!result) {
                    return { items: [], inlineCompletionItems: [], decoratedEditItems: [] }
                }

                // Client can only render completions, ensure we only provide completion items.
                const items: AutocompleteItem[] =
                    result.items.flatMap(({ insertText, range, id }) =>
                        typeof insertText === 'string' && range !== undefined
                            ? [
                                  {
                                      id,
                                      insertText,
                                      range,
                                      type: 'completion',
                                  },
                              ]
                            : []
                    ) ?? []

                return {
                    items,
                    inlineCompletionItems: items,
                    decoratedEditItems: 'decoratedEditItems' in result ? result.decoratedEditItems : [],
                    completionEvent: result.completionEvent,
                }
            } catch (error) {
                if (isRateLimitError(error)) {
                    throw error
                }
                return Promise.reject(error)
            }
        })

        this.registerAuthenticatedRequest('extension/reset', async () => {
            await this.globalState?.reset()
            return null
        })

        this.registerNotification('autocomplete/completionAccepted', async ({ completionID }) => {
            const provider = await vscode_shim.completionProvider()
            await provider.handleDidAcceptCompletionItem(completionID as any)
        })

        this.registerNotification('autocomplete/completionSuggested', async ({ completionID }) => {
            const provider = await vscode_shim.completionProvider()
            provider.unstable_handleDidShowCompletionItem(completionID as any)
        })

        this.registerAuthenticatedRequest(
            'testing/autocomplete/awaitPendingVisibilityTimeout',
            async () => {
                const provider = await vscode_shim.completionProvider()
                return provider.testing_completionSuggestedPromise as Promise<any>
            }
        )

        this.registerAuthenticatedRequest(
            'testing/autocomplete/setCompletionVisibilityDelay',
            async ({ delay }) => {
                const provider = await vscode_shim.completionProvider()
                provider.testing_setCompletionVisibilityDelay(delay)
                return null
            }
        )

        this.registerAuthenticatedRequest('testing/autocomplete/providerConfig', async () => {
            const provider = await vscode_shim.completionProvider()
            if ('config' in provider) {
                return provider.config.provider
            }
            // For autoedits provider which doesn't have config property, return null
            return null
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
        const commandArgs: Partial<CodyCommandArgs> = { source: 'editor' }

        this.registerAuthenticatedRequest('commands/explain', () => {
            return this.createChatPanel(executeExplainCommand(commandArgs))
        })

        this.registerAuthenticatedRequest('editTask/accept', async id => {
            vscode.commands.executeCommand('cody.fixup.codelens.accept', id)
            return null
        })

        this.registerAuthenticatedRequest('editTask/undo', async id => {
            vscode.commands.executeCommand('cody.fixup.codelens.undo', id)
            return null
        })

        this.registerAuthenticatedRequest('editTask/cancel', async id => {
            vscode.commands.executeCommand('cody.fixup.codelens.cancel', id)
            return null
        })

        this.registerAuthenticatedRequest('editTask/getTaskDetails', async id => {
            const taskDetails = this.fixups?.getTaskDetails(id)
            if (taskDetails) {
                return taskDetails
            }

            return Promise.reject(`No task with id ${id}`)
        })

        this.registerAuthenticatedRequest('editTask/retry', async id => {
            const fixupTask = vscode.commands.executeCommand<FixupTask | undefined>(
                'cody.fixup.codelens.retry',
                id
            )
            return fixupTask.then(task => task?.id)
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

        this.registerAuthenticatedRequest('editTask/start', async () => {
            const task = await executeEdit({})
            return task?.id
        })

        this.registerAuthenticatedRequest('commands/smell', () => {
            return this.createChatPanel(executeSmellCommand(commandArgs))
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
            const panelId = await this.createChatPanel(
                Promise.resolve({
                    type: 'chat',
                    session: await vscode.commands.executeCommand('cody.chat.newEditorPanel'),
                })
            )

            const chatId = this.webPanels.panels.get(panelId)?.chatID ?? ''
            return { panelId, chatId }
        })

        this.registerAuthenticatedRequest('chat/sidebar/new', async () => {
            const panelId = await this.createChatPanel(
                Promise.resolve({
                    type: 'chat',
                    session: await vscode.commands.executeCommand('cody.chat.newPanel'),
                })
            )

            const chatId = this.webPanels.panels.get(panelId)?.chatID ?? ''
            return { panelId, chatId }
        })

        this.registerAuthenticatedRequest('chat/models', async ({ modelUsage }) => {
            const clientConfig = await ClientConfigSingleton.getInstance().getConfig()
            return {
                readOnly: !(isDotCom(currentAuthStatus()) || clientConfig?.modelsAPIEnabled),
                models: await modelsService.getModelsAvailabilityStatus(modelUsage),
            }
        })

        this.registerAuthenticatedRequest('chat/export', async input => {
            const { fullHistory = false } = input ?? {}
            const authStatus = currentAuthStatusAuthed()
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
        this.registerAuthenticatedRequest('chat/import', async ({ history, merge }) => {
            const accountKeyedChatHistory: AccountKeyedChatHistory = {}
            for (const [account, chats] of Object.entries(history)) {
                accountKeyedChatHistory[account as ChatHistoryKey] = { chat: chats }
            }
            await chatHistory.importChatHistory(accountKeyedChatHistory, merge, currentAuthStatus())
            return null
        })

        this.registerAuthenticatedRequest('chat/delete', async params => {
            await vscode.commands.executeCommand<AuthStatus>('cody.chat.history.delete', {
                id: params.chatId,
            })

            const localHistory = chatHistory.getLocalHistory(currentAuthStatusAuthed())
            if (localHistory != null) {
                return Object.entries(localHistory?.chat).map(([chatID, chatTranscript]) => ({
                    chatID: chatID,
                    transcript: chatTranscript,
                }))
            }

            return []
        })

        this.registerAuthenticatedRequest('chat/setModel', async ({ id, model }) => {
            const panel = this.webPanels.getPanelOrError(id)
            await waitUntilComplete(panel.extensionAPI.setChatModel(model))
            return null
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
        this.registerRequest(
            'webview/receiveMessageStringEncoded',
            async ({ id, messageStringEncoded }) => {
                await this.receiveWebviewMessage(id, JSON.parse(messageStringEncoded))
                return null
            }
        )
        this.registerNotification('secrets/didChange', async ({ key }) => {
            this.secretsDidChange.fire({ key })
        })

        this.registerNotification('testing/resetStorage', () => {
            localStorage.resetStorage()
        })

        this.registerAuthenticatedRequest('featureFlags/getFeatureFlag', async ({ flagName }) => {
            return featureFlagProvider.evaluateFeatureFlagEphemerally(
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

        this.registerAuthenticatedRequest('internal/getAuthHeaders', async url => {
            const config = await firstResultFromOperation(resolvedConfig)
            return await getAuthHeaders(config.auth, new URL(url))
        })
    }

    private pushPendingPromise(pendingPromise: Promise<unknown>): void {
        if (vscode_shim.isTesting || vscode_shim.isIntegrationTesting) {
            this.pendingPromises.add(pendingPromise)
            pendingPromise.finally(() => this.pendingPromises.delete(pendingPromise))
        }
    }

    private async newGlobalState(clientInfo: ClientInfo): Promise<AgentGlobalState> {
        switch (clientInfo.capabilities?.globalState) {
            case 'server-managed':
                return AgentGlobalState.initialize(
                    clientInfo.name,
                    clientInfo.globalStateDir ?? codyPaths().data
                )
            case 'client-managed':
                throw new Error('client-managed global state is not supported')
            default:
                return AgentGlobalState.initialize(clientInfo.name)
        }
    }

    // ExtensionClient callbacks.

    private fixups: AgentFixupControls | undefined

    public createFixupControlApplicator(
        files: FixupActor & FixupFileCollection
    ): FixupControlApplicator {
        this.fixups = new AgentFixupControls(files, this.notify.bind(this), this.request.bind(this))
        return this.fixups
    }

    get clientName(): string {
        return this.clientInfo?.name.toLowerCase() || 'uninitialized-agent'
    }

    get httpClientNameForLegacyReasons(): string | undefined {
        return this.clientInfo?.legacyNameForServerIdentification ?? undefined
    }

    get clientVersion(): string {
        return this.clientInfo?.version || '0.0.0'
    }

    get capabilities(): ClientCapabilities | undefined {
        return this.clientInfo?.capabilities ?? undefined
    }

    private async handleConfigChanges(
        config: ExtensionConfiguration,
        params?: { forceAuthentication: boolean }
    ): Promise<AuthStatus> {
        const isAuthChange = vscode_shim.isTokenOrEndpointChange(config)
        vscode_shim.setExtensionConfiguration(config)

        // If this is an token or endpoint change we need to save them prior to firing events that update the clients
        try {
            if ((isAuthChange || params?.forceAuthentication) && config.serverEndpoint) {
                await authProvider.validateAndStoreCredentials(
                    {
                        configuration: {
                            customHeaders: config.customHeaders,
                        },
                        auth: {
                            serverEndpoint: config.serverEndpoint,
                            credentials: config.accessToken
                                ? { token: config.accessToken, source: 'paste' }
                                : undefined,
                        },
                        clientState: {
                            anonymousUserID: config.anonymousUserID ?? null,
                        },
                    },
                    'always-store'
                )
                await firstResultFromOperation(localStorage.clientStateChanges)
            }
        } catch (error) {
            console.log('Authentication failed', error)
        }

        // Critical: we need to await for the handling of `onDidChangeConfiguration` to
        // let the new credentials propagate. If we remove the statement below, then
        // autocomplete may return empty results because we can't await for the updated
        // `InlineCompletionItemProvider` to register.
        await vscode_shim.onDidChangeConfiguration.cody_fireAsync({
            affectsConfiguration: () =>
                // assuming the return value below only impacts performance (not
                // functionality), we return true to always trigger the callback.
                true,
        })
        await firstResultFromOperation(resolvedConfig)

        return firstNonPendingAuthStatus()
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

    private async createChatPanel(
        commandResult: Thenable<ChatCommandResult | undefined>
    ): Promise<string> {
        const result = await commandResult
        const { sessionID, webviewPanelOrView: webviewPanel } = result?.session ?? {}
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
                chatResult: await this.createChatPanel(commandResult as Promise<ChatCommandResult>),
            }
        }

        if (result?.type === 'edit') {
            return {
                type: 'edit',
                editResult: result?.task?.id,
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
            await firstNonPendingAuthStatus()
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
