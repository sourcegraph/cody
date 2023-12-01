import { spawn } from 'child_process'
import * as fspromises from 'fs/promises'
import path from 'path'

import { Polly } from '@pollyjs/core'
import envPaths from 'env-paths'
import * as vscode from 'vscode'

import { convertGitCloneURLToCodebaseName } from '@sourcegraph/cody-shared/dist/utils'
import { Client, createClient } from '@sourcegraph/cody-shared/src/chat/client'
import { registeredRecipes } from '@sourcegraph/cody-shared/src/chat/recipes/agent-recipes'
import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'
import { LogEventMode, setUserAgent } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import { BillingCategory, BillingProduct } from '@sourcegraph/cody-shared/src/telemetry-v2'
import { NoOpTelemetryRecorderProvider } from '@sourcegraph/cody-shared/src/telemetry-v2/TelemetryRecorderProvider'
import { TelemetryEventParameters } from '@sourcegraph/telemetry'

import { activate } from '../../vscode/src/extension.node'
import { TextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'

import { newTextEditor } from './AgentTextEditor'
import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'
import { AgentEditor } from './editor'
import { MessageHandler } from './jsonrpc-alias'
import { AutocompleteItem, ClientInfo, ExtensionConfiguration, RecipeInfo } from './protocol-alias'
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
        extensionPath: '__extensionPath_should_never_be_read_from',
        extensionUri: vscode.Uri.from({ scheme: 'file', path: '__extensionUri__should_never_be_read_from' }),
        globalState: {
            keys: () => [],
            get: () => undefined,
            update: () => Promise.resolve(),
            setKeysForSync: () => {},
        },
        logUri: {} as any,
        logPath: {} as any,
        secrets: {
            onDidChange: vscode_shim.emptyEvent(),
            get(key) {
                if (key === 'cody.access-token' && vscode_shim.connectionConfig) {
                    return Promise.resolve(vscode_shim.connectionConfig.accessToken)
                }
                return Promise.resolve(secretStorage.get(key))
            },
            store(key, value) {
                secretStorage.set(key, value)
                return Promise.resolve()
            },
            delete(key) {
                return Promise.resolve()
            },
        },
        storageUri: {} as any,
        subscriptions: [],
        workspaceState: {} as any,
        globalStorageUri: vscode.Uri.file(paths.data),
        storagePath: {} as any,
        globalStoragePath: vscode.Uri.file(paths.data).fsPath,
    })
}

export async function newAgentClient(clientInfo: ClientInfo): Promise<MessageHandler> {
    const asyncHandler = async (reject: (reason?: any) => void): Promise<MessageHandler> => {
        const serverHandler = new MessageHandler()
        const args = process.argv0.endsWith('node') ? process.argv.slice(1, 2) : []
        args.push('jsonrpc')
        const child = spawn(process.argv[0], args, { env: { ENABLE_SENTRY: 'false', ...process.env } })
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
        vscode_shim.setWorkspaceDocuments(this.workspace)
        vscode_shim.setAgent(this)
        this.registerRequest('initialize', async clientInfo => {
            process.stderr.write(
                `Cody Agent: handshake with client '${clientInfo.name}' (version '${clientInfo.version}') at workspace root path '${clientInfo.workspaceRootUri}'\n`
            )

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

            const codyStatus = codyClient.codyStatus
            return {
                name: 'cody-agent',
                authenticated: codyClient.sourcegraphStatus.authenticated,
                codyEnabled: codyStatus.enabled && (clientInfo.extensionConfiguration?.accessToken ?? '').length > 0,
                codyVersion: codyStatus.version,
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
            } catch {
                // ignore, can happen when the client cancels the request
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
                return Promise.reject(error)
            }
        })

        this.registerNotification('autocomplete/completionAccepted', async ({ completionID }) => {
            const client = await this.client
            if (!client) {
                throw new Error('Cody client not initialized')
            }
            const provider = await vscode_shim.completionProvider()
            provider.handleDidAcceptCompletionItem(completionID)
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
            const res = await client.graphqlClient.getCurrentUserIdAndVerifiedEmailAndCodyPro()
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
        vscode_shim.setConnectionConfig(config)
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

    private async reloadAuth(): Promise<void> {
        await vscode_shim.commands.executeCommand('agent.auth.reload')
        await vscode_shim.commands.executeCommand('cody.auth.sync')
    }

    /**
     * @deprecated use `this.telemetryRecorderProvider.getRecorder()` instead.
     */
    private async logEvent(feature: string, action: string, mode: LogEventMode): Promise<null> {
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
