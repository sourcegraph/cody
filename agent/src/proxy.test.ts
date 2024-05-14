import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

// For setup steps of this look for the notion document "Proxy Setup and Networking changes in Cody"
describe('HTTP Proxy', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'http-proxy',
        credentials: TESTING_CREDENTIALS.dotcom,
        extraConfiguration: {
            'cody.experimental.symfContext': false,
        },
        extraEnvironmentVariables: {
            http_proxy: 'http://127.0.0.1:8080',
            https_proxy: 'http://127.0.0.1:8080',
        },
    })

    beforeAll(async () => {
        await workspace.beforeAll()
        await client.beforeAll()
    })

    it('autocomplete/execute (non-empty result)', async () => {
        const sumUri = workspace.file('src', 'sum.ts')
        await client.openFile(sumUri)
        const completions = await client.request('autocomplete/execute', {
            uri: sumUri.toString(),
            position: { line: 1, character: 3 },
            triggerKind: 'Invoke',
        })
        const texts = completions.items.map(item => item.insertText)
        expect(completions.items.length).toBeGreaterThan(0)
        expect(texts).toMatchInlineSnapshot(
            `
              [
                "   return a + b;",
              ]
            `
        )
    }, 10_000)
    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })
})
