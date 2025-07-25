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

    it('autocomplete/execute (non-empty result)', async () => {
        const uri = workspace.file('src', 'sum.ts')
        await client.openFile(uri)

        // Set a small visibility delay for testing purposes.
        const visibilityDelay = 100
        await client.request('testing/autocomplete/setCompletionVisibilityDelay', {
            delay: visibilityDelay,
        })

        // Generate completions for the current cursor position.
        const completions = await client.request('autocomplete/execute', {
            uri: uri.toString(),
            position: { line: 1, character: 4 },
            triggerKind: 'Automatic',
        })
        const completionID = completions.items[0].id

        // Tell completion provider that the completion was shown to the user.
        client.notify('autocomplete/completionSuggested', { completionID })

        // Wait for only half of the time required to mark the completion as read.
        await sleep(visibilityDelay / 2)

        // Change the cursor position discarding the current completion.
        // Since the completion was visible only `visibilityDelay / 2` it should not be marked as read.
        await client.changeFile(uri, {
            selection: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
            },
        })

        // Now the completion visibility timeout is elapsed but because we discarded it, it should not be
        // marked as read because we moved the cursor on the previous step and discarded the completion.
        await client.request('testing/autocomplete/awaitPendingVisibilityTimeout', null)

        // Get the analytics event for the completion to assert the read and accepted state.
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
            "return a + b;",
          ]
        `
        )
    }, 10_000)

    it('autocomplete/execute multiline (non-empty result)', async () => {
        // Open merge sort with a full algorithm implementation to add it to the context.
        // Otherwise there's a higher chance that model won't complete the code because of all
        // the functions in the workspace missing implementations.
        const uri1 = workspace.file('src', 'mergeSort.ts')
        await client.openFile(uri1)

        const uri = workspace.file('src', 'bubbleSort.ts')
        await client.openFile(uri)

        const completions = await client.request('autocomplete/execute', {
            uri: uri.toString(),
            position: { line: 1, character: 4 },
            triggerKind: 'Automatic',
        })

        const completionID = completions.items[0].id
        const texts = completions.items.map(item => item.insertText)

        client.notify('autocomplete/completionSuggested', { completionID })
        // Wait for the completion visibility timeout we use to ensure users read a completion.
        await client.request('testing/autocomplete/awaitPendingVisibilityTimeout', null)
        client.notify('autocomplete/completionAccepted', { completionID })

        const completionEvent = await client.request('testing/autocomplete/completionEvent', {
            completionID,
        })

        expect(completionEvent?.read).toBe(true)
        expect(completionEvent?.acceptedAt).toBeTruthy()

        expect(completions.items.length).toBeGreaterThan(0)
        expect(texts).toMatchSnapshot()
    }, 10_000)
})
