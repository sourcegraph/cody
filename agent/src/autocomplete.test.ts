import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sleep } from '../../vscode/src/completions/utils'
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

    // TODO: use `vi.useFakeTimers()` instead of `sleep()` once it's supported by the agent tests.
    it('autocomplete/execute (non-empty result)', async () => {
        const uri = workspace.file('src', 'sum.ts')
        await client.openFile(uri)
        const completions = await client.request('autocomplete/execute', {
            uri: uri.toString(),
            position: { line: 1, character: 4 },
            triggerKind: 'Invoke',
        })
        const completionID = completions.items[0].id
        await client.notify('autocomplete/completionSuggested', { completionID })
        await sleep(400)

        // Change the cursor position discarding the current completion.
        // The current `COMPLETION_VISIBLE_DELAY_MS` is 750ms and since the completion was visible only 400ms
        // it should not be marked as read.
        await client.changeFile(uri, {
            selection: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
            },
        })

        // Now the completion visibility timeout is elapsed but because we discarded it, it should not be
        // marked as read.
        await sleep(400)

        const completionEvent = await client.request('testing/autocomplete/completionEvent', {
            completionID,
        })
        expect(completionEvent?.read).toBe(false)
        expect(completionEvent?.acceptedAt).toBeFalsy()

        const texts = completions.items.map(item => item.insertText)
        expect(completions.items.length).toBeGreaterThan(0)
        expect(texts).toMatchInlineSnapshot(
            `
          [
            "    return a + b",
          ]
        `
        )
    }, 10_000)

    // TODO: use `vi.useFakeTimers()` instead of `sleep()` once it's supported by the agent tests.
    it('autocomplete/execute multiline(non-empty result)', async () => {
        const uri = workspace.file('src', 'bubbleSort.ts')
        await client.openFile(uri)

        const completions = await client.request('autocomplete/execute', {
            uri: uri.toString(),
            position: { line: 1, character: 4 },
            triggerKind: 'Invoke',
        })
        const completionID = completions.items[0].id
        const texts = completions.items.map(item => item.insertText)

        await client.notify('autocomplete/completionSuggested', { completionID })
        await sleep(800) // Wait for the completion visibility timeout (750ms) to elapse
        await client.notify('autocomplete/completionAccepted', { completionID })

        const completionEvent = await client.request('testing/autocomplete/completionEvent', {
            completionID,
        })

        expect(completionEvent?.read).toBe(true)
        expect(completionEvent?.acceptedAt).toBeTruthy()

        expect(completions.items.length).toBeGreaterThan(0)
        expect(texts).toMatchInlineSnapshot(
            `
          [
            "    for (let i = 0; i < nums.length; i++) {
                  for (let j = i + 1; j < nums.length; j++) {
                      if (nums[i] > nums[j]) {
                          [nums[i], nums[j]] = [nums[j], nums[i]];
                      }
                  }
              }",
          ]
        `
        )
    }, 10_000)
})
