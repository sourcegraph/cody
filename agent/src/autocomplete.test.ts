import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

describe('Autocomplete', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'autocomplete'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'autocomplete',
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

    it('autocomplete/execute (non-empty result)', async () => {
        const uri = workspace.file('src', 'sum.ts')
        await client.openFile(uri)
        const completions = await client.request('autocomplete/execute', {
            uri: uri.toString(),
            position: { line: 1, character: 4 },
            triggerKind: 'Invoke',
        })
        const texts = completions.items.map(item => item.insertText)
        expect(completions.items.length).toBeGreaterThan(0)
        expect(texts).toMatchInlineSnapshot(
            `
          [
            "    return a + b;",
          ]
        `
        )
        client.notify('autocomplete/completionAccepted', {
            completionID: completions.items[0].id,
        })
    }, 10_000)

    it('autocomplete/execute multiline(non-empty result)', async () => {
        const uri = workspace.file('src', 'bubbleSort.ts')
        await client.openFile(uri)
        const completions = await client.request('autocomplete/execute', {
            uri: uri.toString(),
            position: { line: 1, character: 4 },
            triggerKind: 'Invoke',
        })
        const texts = completions.items.map(item => item.insertText)
        expect(completions.items.length).toBeGreaterThan(0)
        expect(texts).toMatchInlineSnapshot(
            `
          [
            "    for (let i = 0; i < nums.length; i++) {
                  for (let j = i + 1; j < nums.length; j++) {
                      if (nums[i] > nums[j]) {
                          [nums[i], nums[j]] = [nums[j], nums[i]]
                      }
                  }
              }",
          ]
        `
        )
        client.notify('autocomplete/completionAccepted', {
            completionID: completions.items[0].id,
        })
    }, 10_000)
})
