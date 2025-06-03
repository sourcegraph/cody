import type * as vscode from 'vscode'

import type { CodeToReplaceData } from '@sourcegraph/cody-shared'
import { getNewLineChar } from '../../completions/text-processing'

import { autoeditsOutputChannelLogger } from '../output-channel-logger'

export const INITIAL_TEXT_START_MARKER = '\n<<<<\n'
export const REPLACER_TEXT_START_MARKER = '\n====\n'
export const REPLACER_TEXT_END_MARKER = '\n>>>>\n'

interface AutoEditResponseFromTemplate {
    initial: { text: string; startOffset: number; endOffset: number }
    replacer: { text: string; startOffset: number; endOffset: number }
}

export function extractAutoEditResponseFromCurrentDocumentCommentTemplate(
    document: vscode.TextDocument | undefined,
    position: vscode.Position | undefined
): AutoEditResponseFromTemplate | undefined {
    if (!document || !position) {
        return undefined
    }
    const cursorOffset = document.offsetAt(position)
    const documentText = document.getText()
    const text = documentText.substring(0, cursorOffset)

    const initial = getTextBetweenMarkers({
        text,
        startMarker: INITIAL_TEXT_START_MARKER,
        endMarker: REPLACER_TEXT_START_MARKER,
    })

    const replacer = getTextBetweenMarkers({
        text,
        startMarker: REPLACER_TEXT_START_MARKER,
        endMarker: REPLACER_TEXT_END_MARKER,
    })

    return initial && replacer ? { initial, replacer } : undefined
}

/**
 * Used to generate autoedit mock server responses based on the comment templates.
 * Allows to manually test the autoedits UX end-to-end with acceptance and dismissal.
 */
export function shrinkReplacerTextToCodeToReplaceRange(
    autoEditResponseFromTemplate: AutoEditResponseFromTemplate,
    codeToReplaceData: CodeToReplaceData
) {
    const { initial, replacer } = autoEditResponseFromTemplate
    const codeToRewrite = codeToReplaceData.codeToRewrite.trimEnd()

    const newLineChar = getNewLineChar(codeToRewrite)
    const codeToRewriteLines = codeToRewrite.split(newLineChar)
    const rewriteStartOffset = initial.text.indexOf(codeToRewrite)
    const rewriteStartLineNumber = offsetToLineNumber(initial.text, rewriteStartOffset)

    if (rewriteStartLineNumber === -1) {
        autoeditsOutputChannelLogger.logError(
            'shrinkReplacerTextToCodeToReplaceRange',
            'unable to find `codeToRewrite` start offset'
        )
        return undefined
    }
    const suffixLinesNumber = initial.text
        .split(newLineChar)
        .slice(rewriteStartLineNumber + codeToRewriteLines.length).length

    const replacerLines = replacer.text.split(newLineChar)

    const predictionLines = replacerLines.slice(
        rewriteStartLineNumber,
        suffixLinesNumber > 0 ? -suffixLinesNumber : replacerLines.length
    )

    return (
        predictionLines.join(newLineChar) +
        (codeToReplaceData.codeToRewrite.endsWith(newLineChar) ? newLineChar : '')
    )
}

function offsetToLineNumber(text: string, offset: number): number {
    if (offset < 0 || offset > text.length) {
        return -1
    }

    return text.slice(0, offset).split('\n').length - 1
}

export function getTextBetweenMarkers({
    text,
    startMarker,
    endMarker,
}: {
    text: string
    startMarker: string
    endMarker: string
}): { text: string; startOffset: number; endOffset: number } | undefined {
    const startIndex = text.indexOf(startMarker)
    const startOffset = startIndex + startMarker.length
    const endIndex = text.indexOf(endMarker)

    if (startIndex !== -1 && endIndex !== -1) {
        return {
            text: text.slice(startOffset, endIndex),
            startOffset,
            endOffset: endIndex,
        }
    }

    return undefined
}
