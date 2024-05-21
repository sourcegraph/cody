import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

describe('Autocomplete', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))
    const sumUri = workspace.file('src', 'sum.ts')
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'autocompleteClient',
        credentials: TESTING_CREDENTIALS.dotcom,
        // hardcodeNonessentialNetworkTraffic: true
    })
    beforeAll(async () => {
        await workspace.beforeAll()
        await client.beforeAll()
    })
    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })

    it('autocomplete/execute (non-empty result)', async () => {
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
        client.notify('autocomplete/completionAccepted', {
            completionID: completions.items[0].id,
        })
    }, 10_000)
})
