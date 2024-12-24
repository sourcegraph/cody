import dedent from 'dedent'
import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'
import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'
import { getDecorationInfoFromPrediction } from '../autoedits-provider'
import { createCodeToReplaceDataForTest } from '../prompt/test-helper'
import { AutoEditsDefaultRendererManager } from '../renderer/manager'
import { DefaultDecorator } from './decorators/default-decorator'
import type { AutoeditRendererManagerArgs } from './manager'

describe('AutoEditsDefaultRendererManager', () => {
    const getAutoeditRendererManagerArgs = (
        documentText: string,
        prediction: string
    ): AutoeditRendererManagerArgs => {
        const { document, position } = documentAndPosition(documentText)
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })
        const codeToReplaceData = createCodeToReplaceDataForTest`${documentText}`
        const decorationInfo = getDecorationInfoFromPrediction(document, prediction, codeToReplaceData)
        return {
            prediction,
            codeToReplaceData,
            document,
            position,
            docContext,
            decorationInfo,
        }
    }

    describe('maybeRenderDecorationsAndTryMakeInlineCompletionResponse', () => {
        let manager: AutoEditsDefaultRendererManager

        beforeEach(() => {
            manager = new AutoEditsDefaultRendererManager(
                (editor: vscode.TextEditor) => new DefaultDecorator(editor)
            )
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
                function greet() { console.log("Hello") }
            `
            const args = getAutoeditRendererManagerArgs(documentText, prediction)
            const result = await manager.maybeRenderDecorationsAndTryMakeInlineCompletionResponse(args)
            expect(result).toBeDefined()
            assertInlineCompletionItems(
                result.inlineCompletions!,
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
                function greet() { console.log("Hello") }
            `
            const args = getAutoeditRendererManagerArgs(documentText, prediction)
            const result = await manager.maybeRenderDecorationsAndTryMakeInlineCompletionResponse(args)
            expect(result).toBeDefined()
            assertInlineCompletionItems(
                result.inlineCompletions!,
                dedent`
                console.log(a, b, c)
                const d = 10
                const e = 20
            `
            )
        })
    })
})
