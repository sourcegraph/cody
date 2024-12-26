import dedent from 'dedent'
import { describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { documentAndPosition } from '../../completions/test-helpers'
import type { CodeToReplaceData } from '../prompt/prompt-utils'
import { createCodeToReplaceDataForTest } from '../prompt/test-helper'
import {
    INITIAL_TEXT_START_MARKER,
    REPLACER_TEXT_END_MARKER,
    REPLACER_TEXT_START_MARKER,
    extractAutoEditResponseFromCurrentDocumentCommentTemplate,
    getTextBetweenMarkers,
    shrinkReplacerTextToCodeToReplaceRange,
} from './mock-renderer'

function getCodeToReplaceForRenderer(
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

describe('renderer-testing', () => {
    const createDocumentTextForMockRenderer = (param: {
        beforeText: string
        initialText: string
        replacerText: string
        afterText: string
    }) => {
        const textList = [
            param.beforeText,
            INITIAL_TEXT_START_MARKER,
            param.initialText,
            REPLACER_TEXT_START_MARKER,
            param.replacerText,
            REPLACER_TEXT_END_MARKER,
            param.afterText,
        ]
        return textList.join('')
    }
    describe('extractAutoEditResponseFromCurrentDocumentCommentTemplate', () => {
        it('extracts initial and replacement text correctly', () => {
            const documentText = createDocumentTextForMockRenderer({
                beforeText: 'Some text before',
                initialText: 'initial text here',
                replacerText: 'replacement text here',
                afterText: 'Some text█ after',
            })
            const { document, position } = documentAndPosition(documentText)
            const result = extractAutoEditResponseFromCurrentDocumentCommentTemplate(document, position)

            expect(result).toEqual({
                initial: {
                    text: 'initial text here',
                    startOffset: 22,
                    endOffset: 39,
                },
                replacer: {
                    text: 'replacement text here',
                    startOffset: 45,
                    endOffset: 66,
                },
            })
        })

        it('handles empty initial and replacement text', () => {
            const documentText = createDocumentTextForMockRenderer({
                beforeText: 'Some text before',
                initialText: '',
                replacerText: '',
                afterText: 'Some text█ after',
            })
            const { document, position } = documentAndPosition(documentText)
            const result = extractAutoEditResponseFromCurrentDocumentCommentTemplate(document, position)

            expect(result).toEqual({
                initial: {
                    text: '',
                    startOffset: 22,
                    endOffset: 22,
                },
                replacer: {
                    text: '',
                    startOffset: 28,
                    endOffset: 28,
                },
            })
        })

        it('handles special characters in text', () => {
            const documentText = createDocumentTextForMockRenderer({
                beforeText: 'Some text before',
                initialText: '/**\n * @test\n */',
                replacerText: '// Special chars: $@#%^&*',
                afterText: 'Some text█ after',
            })
            const { document, position } = documentAndPosition(documentText)
            const result = extractAutoEditResponseFromCurrentDocumentCommentTemplate(document, position)

            expect(result).toEqual({
                initial: {
                    text: '/**\n * @test\n */',
                    startOffset: 22,
                    endOffset: 38,
                },
                replacer: {
                    text: '// Special chars: $@#%^&*',
                    startOffset: 44,
                    endOffset: 69,
                },
            })
        })

        it('returns undefined when no editor is active', () => {
            vi.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(undefined)
            const result = extractAutoEditResponseFromCurrentDocumentCommentTemplate(
                undefined,
                undefined
            )
            expect(result).toBeUndefined()
        })
    })

    describe('shrinkReplacerTextToCodeToReplaceRange', () => {
        it('shrinks replacer text to code to replace range', () => {
            const initialText = dedent`
                // text before
                const a = 1
                const b =
                const c = 3
                console.log(a, b, c)
                // text after
            `
            const replacerText = dedent`
                // text before
                const a = 1
                const b = 2
                const c = 3
                console.log(a, b, c)
                // text after
            `
            const finalText = dedent`
                // text before
                const a = 1
                const b =█
                const c = 3
                console.log(a, b, c)
                // text after
            `
            const documentText = createDocumentTextForMockRenderer({
                beforeText: '',
                initialText: initialText,
                replacerText: replacerText,
                afterText: finalText,
            })
            const { document, position } = documentAndPosition(documentText)
            const autoEditResponseFromTemplate =
                extractAutoEditResponseFromCurrentDocumentCommentTemplate(document, position)
            expect(autoEditResponseFromTemplate).toBeDefined()

            const codeToReplaceData = getCodeToReplaceForRenderer`${documentText}`
            const result = shrinkReplacerTextToCodeToReplaceRange(
                autoEditResponseFromTemplate!,
                codeToReplaceData
            )
            expect(result).toEqual(dedent`
                const a = 1
                const b = 2
                const c = 3\n
            `)
        })

        it('handles code with different line endings', () => {
            const initialText = 'line1\r\nline2\r\nline3'
            const replacerText = 'line1\r\nmodified\r\nline3'
            const finalText = 'line1\r\nline2█\r\nline3'

            const documentText = createDocumentTextForMockRenderer({
                beforeText: '',
                initialText,
                replacerText,
                afterText: finalText,
            })
            const { document, position } = documentAndPosition(documentText)
            const autoEditResponseFromTemplate =
                extractAutoEditResponseFromCurrentDocumentCommentTemplate(document, position)
            const codeToReplaceData = getCodeToReplaceForRenderer`${documentText}`

            const result = shrinkReplacerTextToCodeToReplaceRange(
                autoEditResponseFromTemplate!,
                codeToReplaceData
            )
            expect(result).toEqual('line1\r\nmodified\r\nline3')
        })

        it('returns undefined when code to rewrite is not found', () => {
            const initialText = 'original text'
            const replacerText = 'modified text'
            const finalText = 'wrong text█'

            const documentText = createDocumentTextForMockRenderer({
                beforeText: '',
                initialText,
                replacerText,
                afterText: finalText,
            })
            const { document, position } = documentAndPosition(documentText)
            const autoEditResponseFromTemplate =
                extractAutoEditResponseFromCurrentDocumentCommentTemplate(document, position)
            const codeToReplaceData = getCodeToReplaceForRenderer`${documentText}`

            const result = shrinkReplacerTextToCodeToReplaceRange(
                autoEditResponseFromTemplate!,
                codeToReplaceData
            )
            expect(result).toBeUndefined()
        })

        it('preserves trailing newline if present in original code', () => {
            const initialText = 'line1\nline2\n'
            const replacerText = 'line1\nmodified\n'
            const finalText = 'line1\nline2█\n'

            const documentText = createDocumentTextForMockRenderer({
                beforeText: '',
                initialText,
                replacerText,
                afterText: finalText,
            })
            const { document, position } = documentAndPosition(documentText)
            const autoEditResponseFromTemplate =
                extractAutoEditResponseFromCurrentDocumentCommentTemplate(document, position)
            const codeToReplaceData = getCodeToReplaceForRenderer`${documentText}`

            const result = shrinkReplacerTextToCodeToReplaceRange(
                autoEditResponseFromTemplate!,
                codeToReplaceData
            )
            expect(result).toEqual('line1\nmodified')
        })

        it('handles empty replacer text', () => {
            const initialText = 'some text'
            const replacerText = ''
            const finalText = 'some text█'

            const documentText = createDocumentTextForMockRenderer({
                beforeText: '',
                initialText,
                replacerText,
                afterText: finalText,
            })
            const { document, position } = documentAndPosition(documentText)
            const autoEditResponseFromTemplate =
                extractAutoEditResponseFromCurrentDocumentCommentTemplate(document, position)
            const codeToReplaceData = getCodeToReplaceForRenderer`${documentText}`

            const result = shrinkReplacerTextToCodeToReplaceRange(
                autoEditResponseFromTemplate!,
                codeToReplaceData
            )
            expect(result).toBeUndefined()
        })
    })

    describe('getTextBetweenMarkers', () => {
        const assertGetTextBetweenMarkers = (param: {
            text: string
            startMarker: string
            endMarker: string
            expected: string
        }) => {
            const result = getTextBetweenMarkers({
                text: param.text,
                startMarker: param.startMarker,
                endMarker: param.endMarker,
            })
            expect(result).toEqual({
                text: param.expected,
                startOffset: param.text.indexOf(param.startMarker) + param.startMarker.length,
                endOffset: param.text.indexOf(param.endMarker),
            })
        }

        it('extracts text between markers correctly', () => {
            const text = 'prefix[START]target text[END]suffix'
            assertGetTextBetweenMarkers({
                text,
                startMarker: '[START]',
                endMarker: '[END]',
                expected: 'target text',
            })
        })

        it('returns undefined when start marker is not found', () => {
            const text = 'prefix[WRONG]target text[END]suffix'
            const result = getTextBetweenMarkers({
                text,
                startMarker: '[START]',
                endMarker: '[END]',
            })
            expect(result).toBeUndefined()
        })

        it('returns undefined when end marker is not found', () => {
            const text = 'prefix[START]target text[WRONG]suffix'
            const result = getTextBetweenMarkers({
                text,
                startMarker: '[START]',
                endMarker: '[END]',
            })

            expect(result).toBeUndefined()
        })

        it('handles empty text between markers', () => {
            const text = 'prefix[START][END]suffix'
            assertGetTextBetweenMarkers({
                text,
                startMarker: '[START]',
                endMarker: '[END]',
                expected: '',
            })
        })
    })
})
