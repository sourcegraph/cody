import path from 'node:path'
import { isWindows } from '@sourcegraph/cody-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

// TODO: fix Windows tests CODY-1280 - TscRetriever isn't working because of a
// bug in our custom `path` implementation.
describe.skipIf(isWindows())('Fix', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'fix'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'fix',
        credentials: TESTING_CREDENTIALS.enterprise,
    })

    beforeAll(async () => {
        await workspace.beforeAll()
        await client.beforeAll()
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })

    it('fixes a basic TypeScript error', async () => {
        const uri = workspace.file('src', 'example-error.ts')
        await client.openFile(uri)
        const { diagnostics } = await client.request('testing/diagnostics', { uri: uri.toString() })
        expect(diagnostics).toHaveLength(1)
        expect(diagnostics[0].message).toMatchInlineSnapshot(
            `"Type 'string' is not assignable to type 'number'."`
        )
        await client.request('diagnostics/publish', { diagnostics })
        const { codeActions } = await client.request('codeActions/provide', {
            location: diagnostics[0].location,
            triggerKind: 'Invoke',
        })
        expect(codeActions).toHaveLength(2)
        const fixAction = codeActions.find(action => action.title.toLowerCase() === 'ask cody to fix')
        if (fixAction === undefined) {
            throw new Error('Could not find fix action')
        }
        const taskId = await client.request('codeActions/trigger', fixAction.id)
        if (!taskId) {
            throw new Error('Task cannot be null or undefined')
        }
        await client.acceptEditTask(uri, taskId)
        expect(client.workspace.getDocument(uri)?.getText()).toMatchInlineSnapshot(`
          "export function fixCommandExample(): number {
              return 42;
          }
          "
        `)
    }, 20_000)
})
