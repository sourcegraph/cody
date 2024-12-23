import { PromptString, ps } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getNewLineChar } from '../../../../completions/text-processing'
import { getLanguageConfig } from '../../../../tree-sitter/language'

export function getTextFromNotebookCells(
    notebook: vscode.NotebookDocument,
    cells: vscode.NotebookCell[]
): PromptString {
    const orderedCells = cells.sort((a, b) => a.index - b.index)
    const cellText: PromptString[] = []
    const languageId = getNotebookLanguageId(notebook)
    for (const cell of orderedCells) {
        const text = PromptString.fromDocumentText(cell.document)
        if (text.trim().length === 0) {
            continue
        }
        if (cell.kind === vscode.NotebookCellKind.Code) {
            cellText.push(text)
        } else if (cell.kind === vscode.NotebookCellKind.Markup) {
            // Add the markdown content as a comment
            cellText.push(getCellMarkupContent(languageId, text))
        }
    }
    return PromptString.join(cellText, ps`\n\n`)
}

export function getNotebookLanguageId(notebook: vscode.NotebookDocument): string {
    const cells = notebook.getCells()
    for (const cell of cells) {
        if (cell.kind === vscode.NotebookCellKind.Code) {
            return cell.document.languageId
        }
    }
    return cells.length > 0 ? cells[0].document.languageId : ''
}

export function getCellMarkupContent(languageId: string, text: PromptString): PromptString {
    if (text.trim().length === 0) {
        return ps``
    }
    const languageConfig = getLanguageConfig(languageId)
    const commentStart = languageConfig ? languageConfig.commentStart : ps`// `
    const newLineChar = getNewLineChar(text.toString())

    const contentLines = text.split(newLineChar).map(line => ps`${commentStart}${line}`)
    return PromptString.join(contentLines, ps`\n`)
}
