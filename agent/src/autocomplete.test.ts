import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { TESTING_TOKENS } from './testing-tokens'

describe('Autocomplete', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))
    beforeAll(async () => {
        await workspace.beforeAll()
    })
    describe('model:fireworks/hybrid', () => {
        beforeAll(async () => {
            await hybrid.beforeAll()
        })
        const hybrid = TestClient.create({
            workspaceRootUri: workspace.rootUri,
            name: 'starcoder-hybrid',
            token: TESTING_TOKENS.dotcom,
            extraConfiguration: {
                'cody.autocomplete.advanced.provider': 'fireworks',
                'cody.autocomplete.advanced.model': 'starcoder-hybrid',
                'cody.experimental.symfContext': false,
            },
        })
        it('uses 16b on explicit trigger', async () => {
            const uri = workspace.file('src', 'animal.ts')
            await hybrid.changeFile(uri, { text: '// Single-line comment, yes or no: /* CURSOR */\n' })
            const result = await hybrid.autocompleteText({ triggerKind: 'Automatic' })
            expect(result).toMatchInlineSnapshot(`
              [
                "// Single-line comment, yes or no: yes",
              ]
            `)
            const lastRequest = await hybrid.lastCompletionRequest()
            expect(JSON.parse(lastRequest?.body ?? '')?.model).include('starcoder-7b')

            await hybrid.autocompleteText({ triggerKind: 'Invoke' })
            const lastRequest2 = await hybrid.lastCompletionRequest()
            expect(JSON.parse(lastRequest2?.body ?? '')?.model).include('starcoder-16b')
        })
        afterAll(async () => {
            await hybrid.afterAll()
        })
    })
    afterAll(async () => {
        await workspace.afterAll()
    })
})
