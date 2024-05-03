import { expect } from 'vitest'
import type * as vscode from 'vscode'
import YAML from 'yaml'
import type { TestClient } from './TestClient'
import type { AutocompleteParams } from './protocol-alias'
import { trimEndOfLine } from './trimEndOfLine'

/**
 * Utility class to interact with a list of Cody Agent clients in parallel. For
 * example, useful to compare results between different models.
 */
export class ParallelTestClients {
    public modelFilter: { provider?: string; model?: string } = {}
    constructor(public readonly all: TestClient[]) {}
    public async beforeAll(): Promise<void> {
        const serverInfos = await Promise.all(this.all.map(client => client.initialize()))
        for (const info of serverInfos) {
            expect(info.authStatus?.isLoggedIn).toBeTruthy()
        }
    }
    public async afterAll(): Promise<void> {
        await this.forEachClient(client => client.shutdownAndExit())
    }
    public activeClients(): TestClient[] {
        return this.all.filter(client => this.matchesFilter(client))
    }

    private matchesFilter(client: TestClient): boolean {
        if (
            this.modelFilter.provider &&
            !client.completionProvider.includes(this.modelFilter.provider)
        ) {
            return false
        }
        if (this.modelFilter.model && !client.completionModel.includes(this.modelFilter.model)) {
            return false
        }
        return true
    }

    public async forEachClient(fn: (client: TestClient) => Promise<void>): Promise<void> {
        await Promise.all(this.all.map(fn))
    }
    public async openFile(uri: vscode.Uri): Promise<void> {
        await this.forEachClient(client => client.openFile(uri))
    }
    public async changeFile(uri: vscode.Uri, text: string): Promise<void> {
        await this.forEachClient(client => client.changeFile(uri, { text }))
    }
    public async autocompletes(params?: Partial<AutocompleteParams>): Promise<any> {
        const autocompletes: { name: string; value: string[] }[] = []
        const prompts: { name: string; value: any }[] = []
        await Promise.all(
            this.activeClients().map(async client => {
                const autocomplete = await client.autocompleteText(params)
                const { requests } = await client.request('testing/networkRequests', null)
                const lastRequest = requests.filter(({ url }) => url.includes('/completions/')).at(-1)
                let prompt: any = lastRequest?.body
                if (prompt) {
                    prompt = JSON.parse(prompt)
                }
                const provider = client.completionProvider
                const model = client?.completionModel
                if (!provider) {
                    throw new Error(`Missing provider for client ${client.name}`)
                }
                if (!model) {
                    throw new Error(`Missing model for client ${client.name}`)
                }
                if (provider === 'fireworks') {
                    // Handle `.prompt` when using fastpass, with fallback to non-fastpath.
                    prompt = prompt?.prompt ?? prompt?.messages
                } else if (provider === 'anthropic') {
                    prompt = prompt?.messages
                } else {
                    throw new Error(`Unknown provider ${provider}`)
                }
                if (prompt?.model) {
                    prompt.model = undefined
                }
                autocompletes.push({ name: model, value: autocomplete })

                if (!prompts.some(p => p.name === provider)) {
                    prompts.push({ name: provider, value: prompt })
                }
            })
        )
        autocompletes.sort((a, b) => a.name.localeCompare(b.name))
        prompts.sort((a, b) => a.name.localeCompare(b.name))
        return trimEndOfLine(YAML.stringify({ autocompletes, prompts }))
    }
}
