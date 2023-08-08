import { URI } from 'vscode-uri'

import { Client, createClient } from '@sourcegraph/cody-shared/src/chat/client'
import { registeredRecipes } from '@sourcegraph/cody-shared/src/chat/recipes/agent-recipes'
import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'

import { AgentEditor } from './editor'
import { MessageHandler } from './jsonrpc'
import { ConnectionConfiguration, TextDocument } from './protocol'

export class Agent extends MessageHandler {
    private client: Promise<Client | null> = Promise.resolve(null)
    public workspaceRootUri: URI | null = null
    public activeDocumentFilePath: string | null = null
    public documents: Map<string, TextDocument> = new Map()

    constructor() {
        super()

        this.setClient({
            customHeaders: {},
            accessToken: process.env.SRC_ACCESS_TOKEN || '',
            serverEndpoint: process.env.SRC_ENDPOINT || 'https://sourcegraph.com',
        })

        this.registerRequest('initialize', async client => {
            process.stderr.write(
                `Cody Agent: handshake with client '${client.name}' (version '${client.version}') at workspace root path '${client.workspaceRootUri}'\n`
            )
            this.workspaceRootUri = URI.parse(client.workspaceRootUri || `file://${client.workspaceRootPath}`)
            if (client.connectionConfiguration) {
                this.setClient(client.connectionConfiguration)
            }

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
                codyEnabled: codyStatus.enabled,
                codyVersion: codyStatus.version,
            }
        })
        this.registerNotification('initialized', () => {})

        this.registerRequest('shutdown', () => Promise.resolve(null))

        this.registerNotification('exit', () => {
            process.exit(0)
        })

        this.registerNotification('textDocument/didFocus', document => {
            this.activeDocumentFilePath = document.filePath
        })
        this.registerNotification('textDocument/didOpen', document => {
            this.documents.set(document.filePath, document)
            this.activeDocumentFilePath = document.filePath
        })
        this.registerNotification('textDocument/didChange', document => {
            if (document.content === undefined) {
                document.content = this.documents.get(document.filePath)?.content
            }
            this.documents.set(document.filePath, document)
            this.activeDocumentFilePath = document.filePath
        })
        this.registerNotification('textDocument/didClose', document => {
            this.documents.delete(document.filePath)
        })

        this.registerNotification('connectionConfiguration/didChange', config => {
            this.setClient(config)
        })

        this.registerRequest('recipes/list', () =>
            Promise.resolve(
                Object.values(registeredRecipes).map(({ id }) => ({
                    id,
                    title: id, // TODO: will be added in a follow PR
                }))
            )
        )

        this.registerRequest('recipes/execute', async data => {
            const client = await this.client
            if (!client) {
                return null
            }
            await client.executeRecipe(data.id, {
                humanChatInput: data.humanChatInput,
                data: data.data,
            })
            return null
        })

        this.registerRequest('autocomplete/execute', async params => {        
            const client = await this.client
            if (!client) {
                return null
            }
            return client.executeAutocomplete(params)
        })
    }

    private setClient(config: ConnectionConfiguration): void {
        this.client = createClient({
            editor: new AgentEditor(this),
            config: { ...config, useContext: 'none' },
            setMessageInProgress: messageInProgress => {
                this.notify('chat/updateMessageInProgress', messageInProgress)
            },
            setTranscript: () => {
                // Not supported yet by agent.
            },
            createCompletionsClient: config => new SourcegraphNodeCompletionsClient(config),
        })
    }
}
