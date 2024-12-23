import * as vscode from 'vscode'
import { lines } from '../../../../completions/text-processing'
import { getLanguageConfig } from '../../../../tree-sitter/language'

export function getTextFromNotebookCells(
    notebook: vscode.NotebookDocument,
    cells: vscode.NotebookCell[]
): string {
    const orderedCells = cells.sort((a, b) => a.index - b.index)
    const cellText: string[] = []
    const languageId = getNotebookLanguageId(notebook)
    for (const cell of orderedCells) {
        const text = cell.document.getText()
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
    return cellText.join('\n\n')
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

export function getCellMarkupContent(languageId: string, text: string): string {
    if (text.trim().length === 0) {
        return ''
    }
    const languageConfig = getLanguageConfig(languageId)
    const commentStart = languageConfig ? languageConfig.commentStart : '// '
    const contentLines = lines(text)
    const markdownContent = contentLines.map(line => `${commentStart}${line}`).join('\n')
    return markdownContent
}
