import path from 'path'

import * as vscode from 'vscode'

import { Client, createClient } from '@sourcegraph/cody-shared/src/chat/client'
import { registeredRecipes } from '@sourcegraph/cody-shared/src/chat/recipes/agent-recipes'
import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'
import { setUserAgent } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

import { activate } from '../../vscode/src/extension.node'

import { AgentTextDocument } from './AgentTextDocument'
import { newTextEditor } from './AgentTextEditor'
import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'
import { AgentEditor } from './editor'
import { MessageHandler } from './jsonrpc'
import { AutocompleteItem, ExtensionConfiguration, RecipeInfo } from './protocol'
import * as vscode_shim from './vscode-shim'

const secretStorage = new Map<string, string>()

function initializeVscodeExtension(): void {
    activate({
        asAbsolutePath(relativePath) {
            return path.resolve(process.cwd(), relativePath)
        },
        environmentVariableCollection: {} as any,
        extension: {} as any,
        extensionMode: {} as any,
        extensionPath: {} as any,
        extensionUri: {} as any,
        globalState: {
            keys: () => [],
            get: () => undefined,
            update: (key, value) => Promise.resolve(),
            setKeysForSync: keys => {},
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
        globalStorageUri: {} as any,
        storagePath: {} as any,
        globalStoragePath: {} as any,
    })
}

export class Agent extends MessageHandler {
    private client: Promise<Client | null> = Promise.resolve(null)
    private oldClient: Client | null = null
    public workspace = new AgentWorkspaceDocuments()

    constructor() {
        super()
        vscode_shim.setWorkspaceDocuments(this.workspace)
        vscode_shim.setAgent(this)
        this.registerRequest('initialize', async client => {
            process.stderr.write(
                `Cody Agent: handshake with client '${client.name}' (version '${client.version}') at workspace root path '${client.workspaceRootUri}'\n`
            )
            initializeVscodeExtension()
            this.workspace.workspaceRootUri = client.workspaceRootUri
                ? vscode_shim.Uri.parse(client.workspaceRootUri)
                : vscode_shim.Uri.from({ scheme: 'file', path: client.workspaceRootPath })

            if (client.extensionConfiguration) {
                this.setClient(client.extensionConfiguration)
            }

            setUserAgent(`${client?.name} / ${client?.version}`)

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
                codyEnabled: codyStatus.enabled && (client.extensionConfiguration?.accessToken ?? '').length > 0,
                codyVersion: codyStatus.version,
            }
        })
        this.registerNotification('initialized', () => {})

        this.registerRequest('shutdown', () => Promise.resolve(null))

        this.registerNotification('exit', () => {
            process.exit(0)
        })

        this.registerNotification('textDocument/didFocus', document => {
            this.workspace.setActiveTextEditor(newTextEditor(this.workspace.agentTextDocument(document)))
        })
        this.registerNotification('textDocument/didOpen', document => {
            this.workspace.setDocument(document)
            const textDocument = this.workspace.agentTextDocument(document)
            vscode_shim.onDidOpenTextDocument.fire(textDocument)
            this.workspace.setActiveTextEditor(newTextEditor(textDocument))
        })
        this.registerNotification('textDocument/didChange', document => {
            const textDocument = this.workspace.agentTextDocument(document)
            this.workspace.setDocument(document)
            this.workspace.setActiveTextEditor(newTextEditor(textDocument))
            vscode_shim.onDidChangeTextDocument.fire({
                document: textDocument,
                contentChanges: [], // TODO: implement this. It's only used by recipes, not autocomplete.
                reason: undefined,
            })
        })
        this.registerNotification('textDocument/didClose', document => {
            this.workspace.deleteDocument(document.filePath)
            vscode_shim.onDidCloseTextDocument.fire(this.workspace.agentTextDocument(document))
        })

        this.registerNotification('extensionConfiguration/didChange', config => this.setClient(config))

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
            if (!client) {
                return
            }
            client.reset()
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

            await client.executeRecipe(data.id, {
                signal: abortController.signal,
                humanChatInput: data.humanChatInput,
                data: data.data,
            })
            return null
        })
        this.registerRequest('autocomplete/execute', async (params, token) => {
            await this.client // To let configuration changes propagate
            const provider = await vscode_shim.completionProvider()
            if (!provider) {
                console.log('Completion provider is not initialized')
                return { items: [] }
            }
            const document = this.workspace.getDocument(params.filePath)
            if (!document) {
                console.log('No document found for file path', params.filePath, [...this.workspace.allFilePaths()])
                return { items: [] }
            }

            const textDocument = new AgentTextDocument(document)

            try {
                if (params.triggerKind === 'Invoke') {
                    await provider.manuallyTriggerCompletion()
                }
                const result = await provider.provideInlineCompletionItems(
                    textDocument,
                    new vscode.Position(params.position.line, params.position.character),
                    {
                        triggerKind: vscode.InlineCompletionTriggerKind[params.triggerKind || 'Automatic'],
                        selectedCompletionInfo: undefined,
                    },
                    token
                )
                const items: AutocompleteItem[] =
                    result === null
                        ? []
                        : result.items.flatMap(({ insertText, range }) =>
                              typeof insertText === 'string' && range !== undefined ? [{ insertText, range }] : []
                          )
                return { items, completionEvent: (result as any)?.completionEvent }
            } catch (error) {
                console.log('autocomplete failed', error)
                return { items: [] }
            }
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
        this.registerRequest('graphql/logEvent', async event => {
            const client = await this.client
            if (typeof event.argument === 'object') {
                event.argument = JSON.stringify(event.argument)
            }
            if (typeof event.publicArgument === 'object') {
                event.publicArgument = JSON.stringify(event.publicArgument)
            }

            await client?.graphqlClient.logEvent(event)
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

        this.registerNotification('autocomplete/clearLastCandidate', async () => {
            const provider = await vscode_shim.completionProvider()
            if (!provider) {
                console.log('Completion provider is not initialized: unable to clear last candidate')
            }
            provider.clearLastCandidate()
        })
    }

    private setClient(config: ExtensionConfiguration): void {
        this.client = this.createAgentClient(config)
        return
    }

    private async createAgentClient(config: ExtensionConfiguration): Promise<Client | null> {
        const isAuthChange = vscode_shim.isAuthenticationChange(config)
        vscode_shim.setConnectionConfig(config)
        // If this is an authentication change we need to reauthenticate prior to firing events
        // that update the clients
        if (isAuthChange) {
            await vscode_shim.commands.executeCommand('agent.auth.reload')
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
}
