import path from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

// Disabled because we don't need to run this test in CI on every PR.  We're
// keeping the test around because it has useful infrastructure to debug memory
// leaks.
describe.skip('Memory Usage', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'memory-usage',
        credentials: TESTING_CREDENTIALS.dotcom,
    })

    beforeAll(async () => {
        await workspace.beforeAll()
        await client.beforeAll()
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })

    it('selection', async () => {
        const uri = workspace.file('src', 'animal.ts')
        await client.openFile(uri)
        const document = client.workspace.getDocument(uri)!
        for (let i = 0; i < 5_000; i++) {
            client.notify('textDocument/didChange', {
                uri: document.uri.toString(),
                selection: {
                    start: { line: 0, character: 0 },
                    end: { line: 1, character: document.lineAt(1).text.length },
                },
            })
        }
        const { usage: usage1 } = await client.request('testing/memoryUsage', null)
        console.log(usage1)
        for (let i = 0; i < 40_000; i++) {
            client.notify('textDocument/didChange', {
                uri: document.uri.toString(),
                selection: {
                    start: { line: 0, character: 0 },
                    end: { line: 1, character: document.lineAt(1).text.length },
                },
            })
            await client.request('testing/awaitPendingPromises', null)
        }
        await new Promise(resolve => setTimeout(resolve, 3_000))

        const { usage: usage2 } = await client.request('testing/memoryUsage', null)
        console.log(usage2)
        console.log({
            diffHeapUsaged: prettyPrintBytes(usage2.heapUsed - usage1.heapUsed),
            diffExternal: prettyPrintBytes(usage2.external - usage1.external),
        })
    }, 20_000)
})

function prettyPrintBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let unitIndex = 0

    while (bytes >= 1024 && unitIndex < units.length - 1) {
        bytes /= 1024
        unitIndex++
    }

    return `${bytes.toFixed(2)} ${units[unitIndex]}`
}
