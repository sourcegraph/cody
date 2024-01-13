import { spawn } from 'child_process'
import * as fspromises from 'fs/promises'
import path from 'path'

import { type Polly } from '@pollyjs/core'
import envPaths from 'env-paths'
import * as vscode from 'vscode'

import { createClient, type Client } from '@sourcegraph/cody-shared/src/chat/client'
import { registeredRecipes } from '@sourcegraph/cody-shared/src/chat/recipes/agent-recipes'
import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'
import { isRateLimitError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import { setUserAgent, type LogEventMode } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import { type BillingCategory, type BillingProduct } from '@sourcegraph/cody-shared/src/telemetry-v2'
import { NoOpTelemetryRecorderProvider } from '@sourcegraph/cody-shared/src/telemetry-v2/TelemetryRecorderProvider'
import { convertGitCloneURLToCodebaseName } from '@sourcegraph/cody-shared/src/utils'
import { type TelemetryEventParameters } from '@sourcegraph/telemetry'

import { chatHistory } from '../../vscode/src/chat/chat-view/ChatHistoryManager'
import { SimpleChatModel } from '../../vscode/src/chat/chat-view/SimpleChatModel'
import { type ChatSession } from '../../vscode/src/chat/chat-view/SimpleChatPanelProvider'
import { type AuthStatus, type ExtensionMessage, type WebviewMessage } from '../../vscode/src/chat/protocol'
import { activate } from '../../vscode/src/extension.node'
import { TextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'

import { AgentGlobalState } from './AgentGlobalState'
import { newTextEditor } from './AgentTextEditor'
import { AgentWebPanels, AgentWebviewPanel } from './AgentWebviewPanel'
import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'
import { AgentEditor } from './editor'
import { MessageHandler } from './jsonrpc-alias'
import { type AutocompleteItem, type ClientInfo, type ExtensionConfiguration, type RecipeInfo } from './protocol-alias'
import { AgentHandlerTelemetryRecorderProvider } from './telemetry'
import * as vscode_shim from './vscode-shim'

const secretStorage = new Map<string, string>()

export async function initializeVscodeExtension(workspaceRoot: vscode.Uri): Promise<void> {
    const paths = envPaths('Cody')
    try {
        const gitdirPath = path.join(workspaceRoot.fsPath, '.git')
        await fspromises.stat(gitdirPath)
        vscode_shim.addGitRepository(workspaceRoot, 'fake_vscode_shim_commit')
    } catch {
        /* ignore */
    }
    await activate({
        asAbsolutePath(relativePath) {
            return path.resolve(workspaceRoot.fsPath, relativePath)
        },
        environmentVariableCollection: {} as any,
        extension: {} as any,
        extensionMode: {} as any,
        // Placeholder string values for extension path/uri. These are only used
        // to resolve paths to icon in the UI. They need to have compatible
        // types but don't have to point to a meaningful path/URI.
        extensionPath: paths.config,
        extensionUri: vscode.Uri.file(paths.config),
        globalState: new AgentGlobalState(),
        logUri: vscode.Uri.file(paths.log),
        logPath: paths.log,
        secrets: {
            onDidChange: vscode_shim.emptyEvent(),
            get(key) {
                if (key === 'cody.access-token' && vscode_shim.extensionConfiguration) {
                    return Promise.resolve(vscode_shim.extensionConfiguration.accessToken)
                }
                return Promise.resolve(secretStorage.get(key))
            },
            store(key, value) {
                secretStorage.set(key, value)
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
    })
}

export async function newAgentClient(clientInfo: ClientInfo & { codyAgentPath?: string }): Promise<MessageHandler> {
    const asyncHandler = async (reject: (reason?: any) => void): Promise<MessageHandler> => {
        const serverHandler = new MessageHandler()
        const nodeArguments = process.argv0.endsWith('node') ? process.argv.slice(1, 2) : []
        nodeArguments.push('jsonrpc')
        const arg0 = clientInfo.codyAgentPath ?? process.argv[0]
        const args = clientInfo.codyAgentPath ? [] : nodeArguments
        const child = spawn(arg0, args, { env: { ENABLE_SENTRY: 'false', ...process.env } })
        serverHandler.connectProcess(child, reject)
        serverHandler.registerNotification('debug/message', params => {
            console.error(`${params.channel}: ${params.message}`)
        })
        await serverHandler.request('initialize', clientInfo)
        serverHandler.notify('initialized', null)
        return serverHandler
    }
    return new Promise<MessageHandler>((resolve, reject) => {
        asyncHandler(reject).then(
            handler => resolve(handler),
            error => reject(error)
        )
    })
}

export async function newEmbeddedAgentClient(clientInfo: ClientInfo): Promise<Agent> {
    process.env.ENABLE_SENTRY = 'false'
    const agent = new Agent()
    const debugHandler = new MessageHandler()
    debugHandler.registerNotification('debug/message', params => {
        console.error(`${params.channel}: ${params.message}`)
    })
    debugHandler.messageEncoder.pipe(agent.messageDecoder)
    agent.messageEncoder.pipe(debugHandler.messageDecoder)
    const client = agent.clientForThisInstance()
    await client.request('initialize', clientInfo)
    client.notify('initialized', null)
    return agent
}

export class Agent extends MessageHandler {
    private client: Promise<Client | null> = Promise.resolve(null)
    private oldClient: Client | null = null
    public workspace = new AgentWorkspaceDocuments()
    public webPanels = new AgentWebPanels()

    private clientInfo: ClientInfo | null = null

    /**
     * agentTelemetryRecorderProvider must be used for all events recording
     * directly within the agent (i.e. code in agent/src/...) and via the agent's
     * 'telemetry/recordEvent' RPC.
     *
     * Components that use VSCode implementations directly (i.e. code in
     * vscode/src/...) will continue to use the shared recorder initialized and
     * configured as part of VSCode initialization in vscode/src/services/telemetry-v2.ts.
     */
    private agentTelemetryRecorderProvider: AgentHandlerTelemetryRecorderProvider = new NoOpTelemetryRecorderProvider([
        {
            processEvent: event =>
                process.stderr.write(
                    `Cody Agent: failed to record telemetry event '${event.feature}/${event.action}' before agent initialization\n`
                ),
        },
    ])

    constructor(private readonly params?: { polly?: Polly | undefined }) {
        super()
        vscode_shim.setAgent(this)
        this.registerRequest('initialize', async clientInfo => {
            this.workspace.workspaceRootUri = vscode.Uri.parse(clientInfo.workspaceRootUri)
            vscode_shim.setWorkspaceDocuments(this.workspace)
            if (process.env.CODY_DEBUG === 'true') {
                process.stderr.write(
                    `Cody Agent: handshake with client '${clientInfo.name}' (version '${clientInfo.version}') at workspace root path '${clientInfo.workspaceRootUri}'\n`
                )
            }

            vscode_shim.setClientInfo(clientInfo)
            // Register client info
            this.clientInfo = clientInfo
            setUserAgent(`${clientInfo?.name} / ${clientInfo?.version}`)

            if (clientInfo.extensionConfiguration) {
                // this must be done before initializing the vscode extension below, as extensionConfiguration
                // is queried in a number of places.
                await this.setClientAndTelemetry(clientInfo.extensionConfiguration)
            }

            this.workspace.workspaceRootUri = clientInfo.workspaceRootUri
                ? vscode.Uri.parse(clientInfo.workspaceRootUri)
                : vscode.Uri.from({ scheme: 'file', path: clientInfo.workspaceRootPath })
            try {
                await initializeVscodeExtension(this.workspace.workspaceRootUri)

                // must be done here, as the commands are not registered when calling setClientAndTelemetry above
                // but setClientAndTelemetry must called before initializing the vscode extension.
                await this.reloadAuth()

                const codyClient = await this.client
                if (!codyClient) {
                    return {
                        name: 'cody-agent',
                        authenticated: false,
                        codyEnabled: false,
                        codyVersion: null,
                    }
                }

                this.registerWebviewHandlers()

                const codyStatus = codyClient.codyStatus
                return {
                    name: 'cody-agent',
                    authenticated: codyClient.sourcegraphStatus.authenticated,
                    codyEnabled:
                        codyStatus.enabled && (clientInfo.extensionConfiguration?.accessToken ?? '').length > 0,
                    codyVersion: codyStatus.version,
                }
            } catch (error) {
                process.stderr.write(
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

        this.registerNotification('textDocument/didFocus', document => {
            this.workspace.setActiveTextEditor(
                newTextEditor(this.workspace.addDocument(TextDocumentWithUri.fromDocument(document)))
            )
        })

        this.registerNotification('textDocument/didOpen', document => {
            const documentWithUri = TextDocumentWithUri.fromDocument(document)
            const textDocument = this.workspace.addDocument(documentWithUri)
            vscode_shim.onDidOpenTextDocument.fire(textDocument)
            this.workspace.setActiveTextEditor(newTextEditor(textDocument))
        })

        this.registerNotification('textDocument/didChange', document => {
            const documentWithUri = TextDocumentWithUri.fromDocument(document)
            const textDocument = this.workspace.addDocument(documentWithUri)
            this.workspace.setActiveTextEditor(newTextEditor(textDocument))
            vscode_shim.onDidChangeTextDocument.fire({
                document: textDocument,
                contentChanges: [], // TODO: implement this. It's only used by recipes, not autocomplete.
                reason: undefined,
            })
        })

        this.registerNotification('textDocument/didClose', document => {
            const documentWithUri = TextDocumentWithUri.fromDocument(document)
            const oldDocument = this.workspace.getDocument(documentWithUri.uri)
            if (oldDocument) {
                this.workspace.deleteDocument(documentWithUri.uri)
                vscode_shim.onDidCloseTextDocument.fire(oldDocument)
            }
        })

        this.registerNotification('extensionConfiguration/didChange', config => {
            this.setClientAndTelemetry(config).catch(() => {
                process.stderr.write('Cody Agent: failed to update configuration\n')
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

        this.registerRequest('testing/progress', async ({ title }) => {
            const thenable = await vscode.window.withProgress(
                { title: 'testing/progress', location: vscode.ProgressLocation.Notification, cancellable: true },
                progress => {
                    progress.report({ message: 'message1' })
                    progress.report({ increment: 50 })
                    progress.report({ increment: 50 })
                    return Promise.resolve({ result: `Hello ${title}` })
                }
            )
            return thenable
        })

        this.registerRequest('testing/progressCancelation', async ({ title }) => {
            const message = await vscode.window.withProgress<string>(
                {
                    title: 'testing/progressCancelation',
                    location: vscode.ProgressLocation.Notification,
                    cancellable: true,
                },
                (progress, token) => {
                    return new Promise<string>((resolve, reject) => {
                        token.onCancellationRequested(() => {
                            progress.report({ message: 'before resolution' })
                            resolve(`request with title '${title}' cancelled`)
                            progress.report({ message: 'after resolution' })
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

        this.registerRequest('recipes/list', () =>
            Promise.resolve(
                Object.values<RecipeInfo>(registeredRecipes).map(({ id, title }) => ({
                    id,
                    title,
                }))
            )
        )

        this.registerNotification('transcript/reset', async () => {
            const client = await this.client
            client?.reset()
        })

        this.registerRequest('command/execute', async params => {
            await vscode.commands.executeCommand(params.command, ...(params.arguments ?? []))
        })

        this.registerRequest('recipes/execute', async (data, token) => {
            const client = await this.client
            if (!client) {
                return null
            }

            const abortController = new AbortController()
            if (token) {
                if (token.isCancellationRequested) {
                    abortController.abort()
                }
                token.onCancellationRequested(() => {
                    abortController.abort()
                })
            }

            await this.logEvent(`recipe:${data.id}`, 'executed', 'dotcom-only')
            this.agentTelemetryRecorderProvider.getRecorder().recordEvent(`cody.recipe.${data.id}`, 'executed')
            try {
                await client.executeRecipe(data.id, {
                    signal: abortController.signal,
                    humanChatInput: data.humanChatInput,

                    data: data.data,
                })
            } catch (error) {
                // can happen when the client cancels the request
                if (isRateLimitError(error)) {
                    throw error
                }
                console.log('recipe failed', error)
            }
            return null
        })

        this.registerRequest('autocomplete/execute', async (params, token) => {
            await this.client // To let configuration changes propagate
            const provider = await vscode_shim.completionProvider()
            if (!provider) {
                console.log('Completion provider is not initialized')
                return { items: [] }
            }
            const uri =
                typeof params.uri === 'string'
                    ? vscode.Uri.parse(params.uri)
                    : params?.filePath
                    ? vscode.Uri.file(params.filePath)
                    : undefined
            if (!uri) {
                console.log(
                    `No uri provided for autocomplete request ${JSON.stringify(
                        params
                    )}. To fix this problem, set the 'uri' property.`
                )
                return { items: [] }
            }
            const document = this.workspace.getDocument(uri)
            if (!document) {
                console.log('No document found for file path', params.uri, [...this.workspace.allUris()])
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
                        triggerKind: vscode.InlineCompletionTriggerKind[params.triggerKind || 'Automatic'],
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
                        typeof insertText === 'string' && range !== undefined ? [{ id, insertText, range }] : []
                    ) ?? []

                return { items, completionEvent: result?.completionEvent }
            } catch (error) {
                console.log('autocomplete failed', error)
                if (isRateLimitError(error)) {
                    throw error
                }
                return Promise.reject(error)
            }
        })

        this.registerNotification('autocomplete/completionAccepted', async ({ completionID }) => {
            const client = await this.client
            if (!client) {
                throw new Error('Cody client not initialized')
            }
            const provider = await vscode_shim.completionProvider()
            await provider.handleDidAcceptCompletionItem(completionID)
        })

        this.registerNotification('autocomplete/completionSuggested', async ({ completionID }) => {
            const client = await this.client
            if (!client) {
                throw new Error('Cody client not initialized')
            }
            const provider = await vscode_shim.completionProvider()
            provider.unstable_handleDidShowCompletionItem(completionID)
        })

        this.registerRequest('graphql/currentUserId', async () => {
            const client = await this.client
            if (!client) {
                throw new Error('Cody client not initialized')
            }
            const id = await client.graphqlClient.getCurrentUserId()
            if (typeof id === 'string') {
                return id
            }

            throw id
        })

        this.registerRequest('graphql/currentUserIsPro', async () => {
            const client = await this.client
            if (!client) {
                throw new Error('Cody client not initialized')
            }
            const res = await client.graphqlClient.getCurrentUserCodyProEnabled()
            if (res instanceof Error) {
                throw res
            }

            return res.codyProEnabled
        })

        this.registerRequest('telemetry/recordEvent', async event => {
            this.agentTelemetryRecorderProvider.getRecorder().recordEvent(
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
                event.parameters as TelemetryEventParameters<{ key: number }, BillingProduct, BillingCategory>
            )
            return Promise.resolve(null)
        })

        /**
         * @deprecated use 'telemetry/recordEvent' instead.
         */
        this.registerRequest('graphql/logEvent', async event => {
            const client = await this.client
            if (typeof event.argument === 'object') {
                event.argument = JSON.stringify(event.argument)
            }
            if (typeof event.publicArgument === 'object') {
                event.publicArgument = JSON.stringify(event.publicArgument)
            }
            await client?.graphqlClient.logEvent(event, 'all')
            return null
        })

        this.registerRequest('graphql/getRepoIdIfEmbeddingExists', async ({ repoName }) => {
            const client = await this.client
            const result = await client?.graphqlClient.getRepoIdIfEmbeddingExists(repoName)
            if (result instanceof Error) {
                console.error('getRepoIdIfEmbeddingExists', result)
            }
            return typeof result === 'string' ? result : null
        })

        this.registerRequest('graphql/getRepoId', async ({ repoName }) => {
            const client = await this.client
            const result = await client?.graphqlClient.getRepoId(repoName)
            if (result instanceof Error) {
                console.error('getRepoId', result)
            }
            return typeof result === 'string' ? result : null
        })

        this.registerRequest('git/codebaseName', ({ url }) => {
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

        this.registerRequest('webview/didDispose', ({ id }) => {
            const panel = this.webPanels.panels.get(id)
            if (!panel) {
                console.log(`No panel with id ${id} found`)
                return Promise.resolve(null)
            }
            panel.dispose()
            return Promise.resolve(null)
        })

        this.registerRequest('chat/new', () => {
            return this.createChatPanel(vscode.commands.executeCommand('cody.chat.panel.new'))
        })

        this.registerRequest('chat/restore', async ({ modelID, messages, chatID }) => {
            const chatModel = new SimpleChatModel(modelID, [], chatID, undefined)
            for (const message of messages) {
                if (message.error) {
                    chatModel.addErrorAsBotMessage(message.error)
                } else if (message.speaker === 'assistant') {
                    chatModel.addBotMessage(message)
                } else if (message.speaker === 'human') {
                    chatModel.addHumanMessage(message)
                }
            }
            const authStatus = await vscode.commands.executeCommand<AuthStatus>('cody.auth.status')
            await chatHistory.saveChat(authStatus, chatModel.toTranscriptJSON())
            return this.createChatPanel(vscode.commands.executeCommand('cody.chat.panel.restore', [chatID]))
        })

        this.registerRequest('chat/models', async ({ id }) => {
            const panel = this.webPanels.getPanelOrError(id)
            if (panel.models) {
                return { models: panel.models }
            }
            await this.receiveWebviewMessage(id, { command: 'get-chat-models' })
            return { models: panel.models ?? [] }
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
                            reject(new Error(`expected transcript message, received ${JSON.stringify(message)}`))
                        }
                    })
                )
                this.receiveWebviewMessage(id, message).then(
                    () => {},
                    error => reject(error)
                )
                disposables.push(
                    token.onCancellationRequested(() => {
                        this.receiveWebviewMessage(id, { command: 'abort' }).then(
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
        this.registerRequest('chat/submitMessage', submitOrEditHandler)
        this.registerRequest('chat/editMessage', submitOrEditHandler)

        this.registerRequest('webview/receiveMessage', async ({ id, message }) => {
            await this.receiveWebviewMessage(id, message)
            return null
        })

        this.registerRequest('featureFlags/getFeatureFlag', async ({ flagName }) => {
            return featureFlagProvider.evaluateFeatureFlag(FeatureFlag[flagName as keyof typeof FeatureFlag])
        })
    }

    private registerWebviewHandlers(): void {
        const webPanels = this.webPanels
        vscode_shim.setCreateWebviewPanel((viewType, title, showOptions, options) => {
            const panel = new AgentWebviewPanel(viewType, title, showOptions, options)
            webPanels.add(panel)

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
                            chatMessage.error.retryAfterDateString = JSON.stringify(chatMessage.error.retryAfterDate)
                            chatMessage.error.retryAfterDate = undefined
                        }
                    }
                    if (panel.isMessageInProgress !== message.isMessageInProgress) {
                        panel.isMessageInProgress = message.isMessageInProgress
                        panel.messageInProgressChange.fire(message)
                    }
                } else if (message.type === 'chatModels') {
                    panel.models = message.models
                }

                this.notify('webview/postMessage', {
                    id: panel.panelID,
                    message,
                })
            })

            return panel
        })
    }

    private async receiveWebviewMessage(id: string, message: WebviewMessage): Promise<void> {
        const panel = this.webPanels.panels.get(id)
        if (!panel) {
            console.log(`No panel with id ${id} found`)
            return
        }
        await panel.receiveMessage.cody_fireAsync(message)
    }

    /**
     * Updates this.client immediately and attempts to update
     * this.telemetryRecorderProvider as well if prerequisite configuration
     * is available.
     */
    private async setClientAndTelemetry(config: ExtensionConfiguration): Promise<void> {
        this.client = this.createAgentClient(config)

        const codyClient = await this.client
        if (codyClient && this.clientInfo) {
            // Update telemetry
            this.agentTelemetryRecorderProvider?.unsubscribe()
            this.agentTelemetryRecorderProvider = new AgentHandlerTelemetryRecorderProvider(
                codyClient.graphqlClient,
                this.clientInfo,
                {
                    // Add tracking metadata if provided
                    getMarketingTrackingMetadata: () => this.clientInfo?.marketingTracking || null,
                }
            )
        }

        return
    }

    private async createAgentClient(config: ExtensionConfiguration): Promise<Client | null> {
        const isAuthChange = vscode_shim.isAuthenticationChange(config)
        vscode_shim.setExtensionConfiguration(config)
        // If this is an authentication change we need to reauthenticate prior to firing events
        // that update the clients
        if (isAuthChange) {
            await this.reloadAuth()
        }
        vscode_shim.onDidChangeConfiguration.fire({
            affectsConfiguration: () =>
                // assuming the return value below only impacts performance (not
                // functionality), we return true to always triggger the callback.
                true,
        })

        const client = await createClient({
            initialTranscript: this.oldClient?.transcript,
            editor: new AgentEditor(this),
            config: { ...config, useContext: 'embeddings', experimentalLocalSymbols: false },
            setMessageInProgress: messageInProgress => {
                this.notify('chat/updateMessageInProgress', messageInProgress)
            },
            setTranscript: () => {
                // Not supported yet by agent.
            },
            createCompletionsClient: (...args) => new SourcegraphNodeCompletionsClient(...args),
        })
        this.oldClient = client
        return client
    }

    private async createChatPanel(commandResult: Thenable<ChatSession | undefined>): Promise<string> {
        const { sessionID, webviewPanel } = (await commandResult) ?? {}
        if (sessionID === undefined) {
            throw new Error('chatID is undefined')
        }
        if (webviewPanel === undefined) {
            throw new Error(`No webview panel for sessionID ${sessionID}`)
        }
        if (!(webviewPanel instanceof AgentWebviewPanel)) {
            throw new TypeError(`Expected AgentWebviewPanel, received ${JSON.stringify(webviewPanel)}`)
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

    private async reloadAuth(): Promise<void> {
        await vscode_shim.commands.executeCommand('agent.auth.reload')

        // TODO(#56621): JetBrains: persistent chat history:
        // This is a temporary workaround to ensure that a new chat panel is created and properly initialized after the auth change.
        this.webPanels.panels.clear()
    }

    /**
     * @deprecated use `this.telemetryRecorderProvider.getRecorder()` instead.
     */
    public async logEvent(feature: string, action: string, mode: LogEventMode): Promise<null> {
        const client = await this.client
        if (!client) {
            return null
        }

        const clientInfo = this.clientInfo
        if (!clientInfo) {
            return null
        }

        const extensionConfiguration = clientInfo.extensionConfiguration
        if (!extensionConfiguration) {
            return null
        }

        const eventProperties = extensionConfiguration.eventProperties
        if (!eventProperties) {
            return null
        }

        const event = `${eventProperties.prefix}:${feature}:${action}`
        await client.graphqlClient.logEvent(
            {
                event,
                url: '',
                client: eventProperties.client,
                userCookieID:
                    this.clientInfo?.extensionConfiguration?.anonymousUserID || eventProperties.anonymousUserID,
                source: eventProperties.source,
                publicArgument: JSON.stringify({
                    serverEndpoint: extensionConfiguration.serverEndpoint,
                    extensionDetails: {
                        ide: clientInfo.name,
                        ideExtensionType: 'Cody',
                        version: clientInfo.version,
                    },
                }),
            },
            mode
        )

        return null
    }
}
