import * as vscode from 'vscode'

import { getNewLineChar } from '../../completions/text-processing'
import type { CodeToReplaceData } from '../prompt/prompt-utils'

import { autoeditsLogger } from '../logger'
import { DefaultDecorator } from './decorators/default-decorator'
import { getDecorationInfo } from './diff-utils'

const INITIAL_TEXT_START_MARKER = '\n<<<<\n'
const REPLACER_TEXT_START_MARKER = '\n====\n'
const REPLACER_TEXT_END_MARKER = '\n>>>>\n'

interface AutoEditResponseFromTemplate {
    initial: { text: string; startOffset: number; endOffset: number }
    replacer: { text: string; startOffset: number; endOffset: number }
}

export function extractAutoEditResponseFromCurrentDocumentCommentTemplate():
    | AutoEditResponseFromTemplate
    | undefined {
    const editor = vscode.window.activeTextEditor
    const document = editor?.document

    if (!editor || !document) {
        return undefined
    }

    const cursorOffset = editor.document.offsetAt(editor.selection.start)
    const documentText = editor.document.getText()
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
    const { codeToRewrite } = codeToReplaceData

    const startOffset = initial.text.indexOf(codeToRewrite.trimEnd())
    if (startOffset === -1) {
        autoeditsLogger.logError(
            'Autoedits',
            '`shrinkReplacerTextToCodeToReplaceRange` unable to find `codeToRewrite` start offset'
        )
        return undefined
    }
    const newLineChar = getNewLineChar(replacer.text)
    const endOffset = startOffset + codeToRewrite.length
    const suffixLineNumber = initial.text.slice(endOffset).split(newLineChar).length
    const replacerTextAndSuffixLines = replacer.text.slice(startOffset).split(newLineChar)
    const predictionLines = replacerTextAndSuffixLines.slice(
        0,
        suffixLineNumber > 0 ? -suffixLineNumber : replacerTextAndSuffixLines.length
    )

    return predictionLines.join(newLineChar) + newLineChar
}

export function registerAutoEditTestRenderCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('cody.supersuggest.testExample', () => {
        const editor = vscode.window.activeTextEditor
        const document = editor?.document

        if (!editor || !document) {
            return
        }

        const text = editor.document.getText()

        // extract replace start line and end line, replacerText, and replacerCol
        const ret = extractAutoEditResponseFromCurrentDocumentCommentTemplate()
        if (!ret) {
            return
        }

        const replacerText = ret.replacer.text
        const replaceStartOffset = ret.replacer.startOffset
        const replaceEndOffset = ret.replacer.endOffset

        const replaceStartLine = editor.document.positionAt(replaceStartOffset).line
        const replaceEndLine = editor.document.positionAt(replaceEndOffset).line

        const decorator = new DefaultDecorator(editor)

        // Splice replacerText into currentFileText at replaceStartLine and replaceEndLine
        const newLineChar = getNewLineChar(text)
        const lines = text.split(newLineChar)

        const predictedFileText = [
            ...lines.slice(0, replaceStartLine),
            replacerText,
            ...lines.slice(replaceEndLine + 1),
        ].join(newLineChar)

        const decorationInformation = getDecorationInfo(text, predictedFileText)
        decorator.setDecorations(decorationInformation)

        const listener = vscode.window.onDidChangeTextEditorSelection(e => {
            decorator.dispose()
            listener.dispose()
        })
    })
}

function getTextBetweenMarkers({
    text,
    startMarker,
    endMarker,
}: {
    text: string
    startMarker: string
    endMarker: string
}): { text: string; startOffset: number; endOffset: number } | undefined {
    const startOffset = text.indexOf(startMarker) + startMarker.length
    const endOffset = text.indexOf(endMarker)

    if (startOffset !== -1 && endOffset !== -1) {
        return {
            text: text.slice(startOffset, endOffset),
            startOffset,
            endOffset,
        }
    }

    return undefined
}
