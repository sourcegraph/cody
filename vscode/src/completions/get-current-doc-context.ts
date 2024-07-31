import * as vscode from 'vscode'

import { addAutocompleteDebugEvent } from '../services/open-telemetry/debug-utils'

import {
    type DocumentContext,
    type DocumentDependentContext,
    type LinesContext,
    getEditorInsertSpaces,
} from '@sourcegraph/cody-shared'
import { detectMultiline } from './detect-multiline'
import {
    getFirstLine,
    getLastLine,
    getNextNonEmptyLine,
    getPositionAfterTextInsertion,
    getPrevNonEmptyLine,
    lines,
} from './text-processing'
import { getMatchingSuffixLength } from './text-processing/process-inline-completions'

interface GetCurrentDocContextParams {
    document: vscode.TextDocument
    position: vscode.Position
    /* A number representing the maximum length of the prefix to get from the document. */
    maxPrefixLength: number
    /* A number representing the maximum length of the suffix to get from the document. */
    maxSuffixLength: number
    context?: vscode.InlineCompletionContext
}

/**
 * Get the current document context based on the cursor position in the current document.
 */
export function getCurrentDocContext(params: GetCurrentDocContextParams): DocumentContext {
    const { document, position, maxPrefixLength, maxSuffixLength, context } = params
    const offset = document.offsetAt(position)

    // TODO(philipp-spiess): This requires us to read the whole document. Can we limit our ranges
    // instead?
    let completePrefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position))

    // For preloading completions we might have a position that is not in the document.
    // For example, if we preload a completion for the next empty line and the current line is
    // indented, the position for preloaded completion would have the same indentation level.
    //
    // But, because the document doesn't not current have whitespace there, the `document.getText(start, end)`
    // would use `end.character === 0` instead of end.character === indentationLevel` position.
    // We have to manually add required whitespace that will be used as a current line prefix in a cache key later.
    const validatedPosition = document.validatePosition(position)
    if (position.line === validatedPosition.line && position.character > validatedPosition.character) {
        const insertSpaces = getEditorInsertSpaces(document.uri, vscode.workspace, vscode.window)
        const indentString = insertSpaces ? ' ' : '\t'
        completePrefix += indentString.repeat(position.character - validatedPosition.character)
    }

    const completeSuffix = document.getText(
        new vscode.Range(position, document.positionAt(document.getText().length))
    )

    // Patch the document to contain the selected completion from the popup dialog already
    let completePrefixWithContextCompletion = completePrefix
    let injectedPrefix = null
    if (context?.selectedCompletionInfo) {
        const { range, text } = context.selectedCompletionInfo
        // A selected completion info attempts to replace the specified range with the inserted text
        //
        // We assume that the end of the range equals the current position, otherwise this would not
        // inject a prefix
        if (range.end.character === position.character && range.end.line === position.line) {
            const lastLine = lines(completePrefix).at(-1)!
            const beforeLastLine = completePrefix.slice(0, -lastLine.length)
            completePrefixWithContextCompletion =
                beforeLastLine + lastLine.slice(0, range.start.character) + text
            injectedPrefix = completePrefixWithContextCompletion.slice(completePrefix.length)
            if (injectedPrefix === '') {
                injectedPrefix = null
            }
        } else {
            console.warn('The selected completion info does not match the current position')
        }
    }

    const prefixLines = lines(completePrefixWithContextCompletion)
    const suffixLines = lines(completeSuffix)
    const prefix = getPrefix({ offset, maxPrefixLength, prefixLines })

    let totalSuffix = 0
    let endLine = 0
    for (let i = 0; i < suffixLines.length; i++) {
        if (totalSuffix + suffixLines[i].length > maxSuffixLength) {
            break
        }
        endLine = i + 1
        totalSuffix += suffixLines[i].length
    }
    const suffix = suffixLines.slice(0, endLine).join('\n')

    return getDerivedDocContext({
        maxPrefixLength,
        maxSuffixLength,
        position,
        languageId: document.languageId,
        documentDependentContext: {
            prefix,
            suffix,
            injectedPrefix,
        },
    })
}

interface GetPrefixParams {
    offset: number
    maxPrefixLength: number
    prefixLines: string[]
}

function getPrefix(params: GetPrefixParams): string {
    const { offset, maxPrefixLength, prefixLines } = params

    let prefix: string
    if (offset > maxPrefixLength) {
        let total = 0
        let startLine = prefixLines.length
        for (let i = prefixLines.length - 1; i >= 0; i--) {
            if (total + prefixLines[i].length > maxPrefixLength) {
                break
            }
            startLine = i
            total += prefixLines[i].length
        }
        prefix = prefixLines.slice(startLine).join('\n')
    } else {
        prefix = prefixLines.join('\n')
    }

    return prefix
}

interface GetDerivedDocContextParams {
    languageId: string
    position: vscode.Position
    documentDependentContext: DocumentDependentContext
    maxPrefixLength: number
    maxSuffixLength: number
}

/**
 * Calculates `DocumentContext` based on the existing prefix and suffix.
 * Used if the document context needs to be calculated for the updated text but there's no `document` instance for that.
 */
function getDerivedDocContext(params: GetDerivedDocContextParams): DocumentContext {
    const { position, documentDependentContext, languageId, maxPrefixLength, maxSuffixLength } = params
    const linesContext = getLinesContext(documentDependentContext)

    const { multilineTrigger, multilineTriggerPosition } = detectMultiline({
        docContext: { ...linesContext, ...documentDependentContext },
        languageId,
        position,
    })

    addAutocompleteDebugEvent('getDerivedDocContext', {
        multilineTrigger,
        multilineTriggerPosition,
    })

    return {
        ...documentDependentContext,
        ...linesContext,
        maxPrefixLength,
        maxSuffixLength,
        position,
        multilineTrigger,
        multilineTriggerPosition,
    }
}

/**
 * Inserts a completion into a specific document context and computes the updated cursor position.
 *
 * This will insert the completion at the `position` outlined in the document context and will
 * replace the whole rest of the line with the completion. This means that if you have content in
 * the sameLineSuffix, it will be an empty string afterwards.
 *
 *
 * NOTE: This will always move the position to the _end_ of the line that the text was inserted at,
 *       regardless of whether the text was inserted before the sameLineSuffix.
 *
 *       When inserting `2` into: `f(1, █);`, the document context will look like this `f(1, 2);█`
 */
interface InsertIntoDocContextParams {
    docContext: DocumentContext
    insertText: string
    languageId: string
}

export function insertIntoDocContext(params: InsertIntoDocContextParams): DocumentContext {
    const {
        insertText,
        languageId,
        docContext,
        docContext: { position, prefix, suffix, currentLineSuffix, maxPrefixLength, maxSuffixLength },
    } = params

    const updatedPosition = getPositionAfterTextInsertion(position, insertText)

    addAutocompleteDebugEvent('getDerivedDocContext', {
        currentLinePrefix: docContext.currentLinePrefix,
        text: insertText,
    })

    const updatedDocumentText = prefix + insertText
    const updatedPrefix = getPrefix({
        offset: updatedDocumentText.length,
        maxPrefixLength,
        prefixLines: lines(updatedDocumentText),
    })

    const updatedDocContext = getDerivedDocContext({
        maxPrefixLength,
        maxSuffixLength,
        languageId,
        position: updatedPosition,
        documentDependentContext: {
            prefix: updatedPrefix,
            // Remove the characters that are being replaced by the completion
            // to reduce the chances of breaking the parse tree with redundant symbols.
            suffix: suffix.slice(getMatchingSuffixLength(insertText, currentLineSuffix)),
            injectedPrefix: null,
        },
    })

    updatedDocContext.positionWithoutInjectedCompletionText =
        updatedDocContext.positionWithoutInjectedCompletionText || docContext.position
    updatedDocContext.injectedCompletionText = (docContext.injectedCompletionText || '') + insertText

    return updatedDocContext
}

interface GetLinesContextParams {
    prefix: string
    suffix: string
}

function getLinesContext(params: GetLinesContextParams): LinesContext {
    const { prefix, suffix } = params

    const currentLinePrefix = getLastLine(prefix)
    const currentLineSuffix = getFirstLine(suffix)

    const prevNonEmptyLine = getPrevNonEmptyLine(prefix)
    const nextNonEmptyLine = getNextNonEmptyLine(suffix)

    return {
        currentLinePrefix,
        currentLineSuffix,
        prevNonEmptyLine,
        nextNonEmptyLine,
    }
}
