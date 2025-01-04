import dedent from 'dedent'
import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'
import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'
import { getDecorationInfoFromPrediction } from '../autoedits-provider'
import type { CodeToReplaceData } from '../prompt/prompt-utils'
import { createCodeToReplaceDataForTest } from '../prompt/test-helper'
import { AutoEditsDefaultRendererManager } from '../renderer/manager'
import { DefaultDecorator } from './decorators/default-decorator'
import type { TryMakeInlineCompletionsArgs } from './manager'

function getCodeToReplaceForManager(
    code: TemplateStringsArray,
    ...values: unknown[]
): CodeToReplaceData {
    return createCodeToReplaceDataForTest(
        code,
        {
            maxPrefixLength: 100,
            maxSuffixLength: 100,
            maxPrefixLinesInArea: 2,
            maxSuffixLinesInArea: 2,
            codeToRewritePrefixLines: 1,
            codeToRewriteSuffixLines: 1,
        },
        ...values
    )
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
        const codeToReplaceData = getCodeToReplaceForManager`${documentText}`
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

    describe('tryMakeInlineCompletions', () => {
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
            const result = manager.tryMakeInlineCompletions(args)
            expect(result).toBeDefined()
            assertInlineCompletionItems(
                result.inlineCompletionItems!,
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
            const result = manager.tryMakeInlineCompletions(args)
            expect(result).toBeDefined()
            assertInlineCompletionItems(
                result.inlineCompletionItems!,
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
                function greet() { console.log("Hello") }
            `
            const args = getAutoeditRendererManagerArgs(documentText, prediction)
            const result = manager.tryMakeInlineCompletions(args)
            expect(result).toBeDefined()
            assertInlineCompletionItems(
                result.inlineCompletionItems!,
                dedent`
                console.log(a, b, c)
            `
            )
        })
    })
})
