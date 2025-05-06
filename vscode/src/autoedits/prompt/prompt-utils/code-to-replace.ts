import {
    type AutoEditsTokenLimit,
    type CodeToReplaceData,
    type DocumentContext,
    PromptString,
    ps,
    tokensToChars,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { getTextFromNotebookCells } from '../../../completions/context/retrievers/recent-user-actions/notebook-utils'
import {
    getCellIndexInActiveNotebookEditor,
    getNotebookCells,
} from '../../../completions/context/retrievers/recent-user-actions/notebook-utils'
import {
    getPrefixWithCharLimit,
    getSuffixWithCharLimit,
} from '../../../completions/get-current-doc-context'
import { clip, splitLinesKeepEnds } from '../../utils'

export interface CurrentFilePromptOptions {
    docContext: DocumentContext
    document: vscode.TextDocument
    position: vscode.Position
    tokenBudget: Pick<
        AutoEditsTokenLimit,
        | 'codeToRewritePrefixLines'
        | 'codeToRewriteSuffixLines'
        | 'maxPrefixLinesInArea'
        | 'maxSuffixLinesInArea'
        | 'prefixTokens'
        | 'suffixTokens'
    >
}

export function getCodeToReplaceData(options: CurrentFilePromptOptions): CodeToReplaceData {
    const {
        position,
        document,
        docContext,
        tokenBudget: {
            codeToRewritePrefixLines,
            codeToRewriteSuffixLines,
            maxPrefixLinesInArea,
            maxSuffixLinesInArea,
            prefixTokens,
            suffixTokens,
        },
    } = options

    const numContextLines = splitLinesKeepEnds(docContext.prefix + docContext.suffix).length
    const numPrefixLines = splitLinesKeepEnds(docContext.prefix).length
    const adjustment = position.character !== 0 ? 1 : 0

    const minLine = clip(position.line - numPrefixLines + adjustment, 0, document.lineCount - 1)
    const maxLine = clip(minLine + numContextLines - 1, 0, document.lineCount - 1)

    const codeToRewriteStart = clip(position.line - codeToRewritePrefixLines, minLine, maxLine)
    const codeToRewriteEnd = clip(position.line + codeToRewriteSuffixLines, minLine, maxLine)
    const areaStart = clip(
        position.line - maxPrefixLinesInArea - codeToRewritePrefixLines,
        minLine,
        maxLine
    )
    const areaEnd = clip(
        position.line + maxSuffixLinesInArea + codeToRewriteSuffixLines,
        minLine,
        maxLine
    )

    // Helper function to create position from line number
    const positionAtLineStart = (line: number) => new vscode.Position(line, 0)
    const positionAtLineEnd = (line: number) => document.lineAt(line).rangeIncludingLineBreak.end

    // Create ranges for different sections
    const ranges = {
        codeToRewrite: new vscode.Range(
            positionAtLineStart(codeToRewriteStart),
            positionAtLineEnd(codeToRewriteEnd)
        ),
        codeToRewritePrefix: new vscode.Range(
            positionAtLineStart(codeToRewriteStart),
            new vscode.Position(position.line, position.character)
        ),
        codeToRewriteSuffix: new vscode.Range(
            new vscode.Position(position.line, position.character),
            positionAtLineEnd(codeToRewriteEnd)
        ),
        prefixInArea: new vscode.Range(
            positionAtLineStart(areaStart),
            positionAtLineStart(codeToRewriteStart)
        ),
        suffixInArea: new vscode.Range(positionAtLineEnd(codeToRewriteEnd), positionAtLineEnd(areaEnd)),
        prefixBeforeArea: new vscode.Range(positionAtLineStart(minLine), positionAtLineStart(areaStart)),
        suffixAfterArea: new vscode.Range(positionAtLineEnd(areaEnd), positionAtLineEnd(maxLine)),
    }

    const remainingPrefixChars = Math.max(0, tokensToChars(prefixTokens) - docContext.prefix.length)
    const remainingSuffixChars = Math.max(0, tokensToChars(suffixTokens) - docContext.suffix.length)

    const { prefixBeforeArea, suffixAfterArea } = getUpdatedCurrentFilePrefixAndSuffixOutsideArea(
        document,
        ranges.prefixBeforeArea,
        ranges.suffixAfterArea,
        remainingPrefixChars,
        remainingSuffixChars
    )

    return {
        codeToRewrite: document.getText(ranges.codeToRewrite),
        codeToRewritePrefix: document.getText(ranges.codeToRewritePrefix),
        codeToRewriteSuffix: document.getText(ranges.codeToRewriteSuffix),
        prefixInArea: document.getText(ranges.prefixInArea),
        suffixInArea: document.getText(ranges.suffixInArea),
        prefixBeforeArea: prefixBeforeArea.toString(),
        suffixAfterArea: suffixAfterArea.toString(),
        range: ranges.codeToRewrite,
    }
}

function getUpdatedCurrentFilePrefixAndSuffixOutsideArea(
    document: vscode.TextDocument,
    rangePrefixBeforeArea: vscode.Range,
    rangeSuffixAfterArea: vscode.Range,
    remainingPrefixChars: number,
    remainingSuffixChars: number
): {
    prefixBeforeArea: PromptString
    suffixAfterArea: PromptString
} {
    const { prefixBeforeAreaForNotebook, suffixAfterAreaForNotebook } =
        getPrefixAndSuffixForAreaForNotebook(document, remainingPrefixChars, remainingSuffixChars)

    const prefixBeforeArea = ps`${prefixBeforeAreaForNotebook}${PromptString.fromDocumentText(
        document,
        rangePrefixBeforeArea
    )}`

    const suffixAfterArea = ps`${PromptString.fromDocumentText(
        document,
        rangeSuffixAfterArea
    )}${suffixAfterAreaForNotebook}`

    return {
        prefixBeforeArea,
        suffixAfterArea,
    }
}

function getPrefixAndSuffixForAreaForNotebook(
    document: vscode.TextDocument,
    remainingPrefixChars: number,
    remainingSuffixChars: number
): {
    prefixBeforeAreaForNotebook: PromptString
    suffixAfterAreaForNotebook: PromptString
} {
    const currentCellIndex = getCellIndexInActiveNotebookEditor(document)
    if (currentCellIndex === -1) {
        return {
            prefixBeforeAreaForNotebook: ps``,
            suffixAfterAreaForNotebook: ps``,
        }
    }
    const activeNotebook = vscode.window.activeNotebookEditor?.notebook!
    const notebookCells = getNotebookCells(activeNotebook)
    const cellsBeforeCurrentCell = notebookCells.slice(0, currentCellIndex)
    const cellsAfterCurrentCell = notebookCells.slice(currentCellIndex + 1)
    const beforeContent = getTextFromNotebookCells(activeNotebook, cellsBeforeCurrentCell)
    const afterContent = getTextFromNotebookCells(activeNotebook, cellsAfterCurrentCell)

    const beforeContentList = beforeContent.split('\n')
    const afterContentList = afterContent.split('\n')

    return {
        prefixBeforeAreaForNotebook: ps`${getPrefixWithCharLimit(
            beforeContentList,
            remainingPrefixChars
        )}\n`,
        suffixAfterAreaForNotebook: ps`\n${getSuffixWithCharLimit(
            afterContentList,
            remainingSuffixChars
        )}`,
    }
}
