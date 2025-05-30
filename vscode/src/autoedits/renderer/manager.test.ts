import dedent from 'dedent'
import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'
import { defaultVSCodeExtensionClient } from '../../extension-client'
import { FixupController } from '../../non-stop/FixupController'
import type { AutoeditRequestID } from '../analytics-logger'
import { type AutoeditClientCapabilities, getDecorationInfoFromPrediction } from '../autoedits-provider'
import { getCodeToReplaceForRenderer } from '../prompt/test-helper'
import { AutoEditsRendererManager } from '../renderer/manager'

import { RequestManager } from '../request-manager'
import type { TryMakeInlineCompletionsArgs } from './manager'
import type { CompletionRenderOutput } from './render-output'

const mockCapabilities: AutoeditClientCapabilities = {
    autoedit: 'enabled',
    autoeditInlineDiff: 'insertions-and-deletions',
    autoeditAsideDiff: 'diff',
}

describe('AutoEditsDefaultRendererManager', () => {
    const getAutoeditRendererManagerArgs = (
        documentText: string,
        prediction: string
    ): TryMakeInlineCompletionsArgs => {
        const { document, position } = documentAndPosition(documentText)
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })
        const codeToReplaceData = getCodeToReplaceForRenderer`${documentText}`
        const decorationInfo = getDecorationInfoFromPrediction(
            document,
            prediction,
            codeToReplaceData.range
        )
        return {
            requestId: 'test-request-id' as AutoeditRequestID,
            prediction,
            codeToReplaceData,
            document,
            position,
            docContext,
            decorationInfo,
        }
    }

    describe('tryMakeInlineCompletions', () => {
        let manager: AutoEditsRendererManager
        const extensionClient = defaultVSCodeExtensionClient()
        const fixupController = new FixupController(extensionClient)

        beforeEach(() => {
            manager = new AutoEditsRendererManager(fixupController, new RequestManager())
        })

        const assertInlineCompletionItems = (
            items: vscode.InlineCompletionItem[],
            expectedCompletion: string
        ) => {
            expect(items).toHaveLength(1)
            expect(items[0].insertText).toEqual(expectedCompletion)
        }

        it('should return single line inline completion when possible', async () => {
            const documentText = dedent`const a = 1
                const b = 2
                const c = 3
                console█
                function greet() { console.log("Hello") }
                const x = 10
                console.log(x)
                console.log("end")
            `
            const prediction = dedent`const c = 3
                console.log(a, b, c)
                function greet() { console.log("Hello") }\n
            `
            const args = getAutoeditRendererManagerArgs(documentText, prediction)
            const result = manager.getRenderOutput(args, mockCapabilities) as CompletionRenderOutput
            expect(result).toBeDefined()
            assertInlineCompletionItems(
                result.inlineCompletionItems,
                dedent`
                console.log(a, b, c)
            `
            )
        })

        it('should return multi line inline completion when possible', async () => {
            const documentText = dedent`const a = 1
                const b = 2
                const c = 3
                console█
                function greet() { console.log("Hello") }
                const x = 10
                console.log(x)
                console.log("end")
            `
            const prediction = dedent`const c = 3
                console.log(a, b, c)
                const d = 10
                const e = 20
                function greet() { console.log("Hello") }\n
            `
            const args = getAutoeditRendererManagerArgs(documentText, prediction)
            const result = manager.getRenderOutput(args, mockCapabilities) as CompletionRenderOutput
            expect(result).toBeDefined()
            assertInlineCompletionItems(
                result.inlineCompletionItems,
                dedent`
                console.log(a, b, c)
                const d = 10
                const e = 20
            `
            )
        })

        it('should return single line inline completion when the suffix is present on same line', async () => {
            const documentText = dedent`const a = 1
                const b = 2
                const c = 3
                console█c)
                function greet() { console.log("Hello") }
                const x = 10
                console.log(x)
                console.log("end")
            `
            const prediction = dedent`const c = 3
                console.log(a, b, c)
                function greet() { console.log("Hello") }\n
            `
            const args = getAutoeditRendererManagerArgs(documentText, prediction)
            const result = manager.getRenderOutput(args, mockCapabilities) as CompletionRenderOutput
            expect(result).toBeDefined()
            assertInlineCompletionItems(
                result.inlineCompletionItems,
                dedent`
                console.log(a, b, c)
            `
            )
        })
    })
})
