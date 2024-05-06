import path from 'node:path'
import { isWindows } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'
import YAML from 'yaml'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { trimEndOfLine } from './trimEndOfLine'

interface TestParameters {
    provider: 'fireworks' | 'anthropic'
    model: string
    graphContext: string
}

// CODY-1280 - fix Windows support
describe.skipIf(isWindows())('Graph Context', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'graph-test'))

    const models: TestParameters[] = [
        { graphContext: 'tsc-mixed', provider: 'fireworks', model: 'starcoder-16b' },
        // The models below are commented out because our focus with graph
        // context for now is to make it work well with starcoder-16b. Running
        // parallel clients makes the tests more flaky and they run slower. If
        // we want to experiment with a new model in the future, then it's easy
        // to compare the results below by adding it to the list here.
        // { graphContext: 'tsc-mixed', provider: 'fireworks', model: 'starcoder-7b' },
        // { graphContext: 'tsc-mixed', provider: 'anthropic', model: 'claude-instant-1.2' },
        // { graphContext: 'tsc-mixed', provider: 'anthropic', model: 'claude-3-haiku-20240307' },
    ]
    const clients: TestClient[] = models.map(({ graphContext, provider, model }) =>
        TestClient.create({
            workspaceRootUri: workspace.rootUri,
            name: `graph-context-${model}`,
            credentials: TESTING_CREDENTIALS.dotcom,
            extraConfiguration: {
                'cody.autocomplete.experimental.graphContext': graphContext,
                'cody.autocomplete.advanced.provider': provider,
                'cody.autocomplete.advanced.model': model,
                'cody.experimental.symfContext': false,
            },
        })
    )

    const modelFilter: { provider?: string; model?: string } = { model: 'starcoder-16b' }
    function matchesFilter(client: TestClient): boolean {
        if (modelFilter.provider && !client.completionProvider.includes(modelFilter.provider)) {
            return false
        }
        if (modelFilter.model && !client.completionModel.includes(modelFilter.model)) {
            return false
        }
        return true
    }

    beforeAll(async () => {
        await workspace.beforeAll()
        const serverInfos = await Promise.all(clients.map(client => client.initialize()))
        for (const info of serverInfos) {
            expect(info.authStatus?.isLoggedIn).toBeTruthy()
        }
    }, 10_000)

    function activeClients(): TestClient[] {
        return clients.filter(client => matchesFilter(client))
    }

    async function forEachClient(fn: (client: TestClient) => Promise<void>): Promise<void> {
        await Promise.all(clients.map(fn))
    }
    async function changeFile(uri: vscode.Uri, text: string): Promise<void> {
        await forEachClient(client => client.changeFile(uri, { text }))
    }
    async function autocompletes(): Promise<any> {
        const autocompletes: { name: string; value: string[] }[] = []
        const prompts: { name: string; value: any }[] = []
        await Promise.all(
            activeClients().map(async client => {
                const autocomplete = await client.autocompleteText({ triggerKind: 'Invoke' })
                const { requests } = await client.request('testing/networkRequests', null)
                let prompt: any = requests
                    .filter(({ url }) => url.includes('/completions/'))
                    .at(-1)?.body
                if (prompt) {
                    prompt = JSON.parse(prompt)
                }
                const provider =
                    client?.params?.extraConfiguration?.['cody.autocomplete.advanced.provider'] ?? ''
                const model =
                    client?.params?.extraConfiguration?.['cody.autocomplete.advanced.model'] ?? ''
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

    describe('Autocomplete', () => {
        const mainUri = workspace.file('src', 'main.ts')

        it('single-line', async () => {
            await changeFile(
                mainUri,
                dedent`
            import { User } from './user'

            const user = /* CURSOR */

            export const message = 'Hello'
            `
            )
            const text = await autocompletes()
            expect(text).includes('firstName:')
            expect(text).includes('isEligible:')
            expect(text).toMatchInlineSnapshot(
                `
              "autocompletes:
                - name: starcoder-16b
                  value:
                    - |-
                      const user = {
                        firstName: 'John',
                        isEligible: true
              prompts:
                - name: fireworks
                  value:
                    - speaker: human
                      text: >-
                        <filename>src/main.ts<fim_prefix>// Additional documentation for
                        \`User\`:

                        //

                        // interface User {

                        //   firstName: string

                        //   isEligible: boolean

                        // }

                        //

                        import { User } from './user'


                        const user = <fim_suffix>


                        export const message = 'Hello'<fim_middle>
              "
            `
            )
        })
    })

    afterAll(async () => {
        await workspace.afterAll()
        await forEachClient(client => client.shutdownAndExit())
    }, 10_000)
})
