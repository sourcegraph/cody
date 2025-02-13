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

function getCellMarkupContent(languageId: string, text: PromptString): PromptString {
    if (text.trim().length === 0) {
        return ps``
    }
    const languageConfig = getLanguageConfig(languageId)
    const commentStart = languageConfig ? languageConfig.commentStart : ps`// `
    const newLineChar = getNewLineChar(text.toString())

    const contentLines = text.split(newLineChar).map(line => ps`${commentStart}${line}`)
    return PromptString.join(contentLines, ps`\n`)
}

/**
 * Returns the index of a notebook cell within the currently active notebook editor.
 * Each cell in the notebook is treated as a seperate document, so this function
 * can be used to find the index of a cell within the notebook.
 * @param document The VS Code text document to find the index for
 * @returns The zero-based index of the cell within the notebook cells, or -1 if not found or no active notebook
 */
export function getCellIndexInActiveNotebookEditor(document: vscode.TextDocument): number {
    const activeNotebook = vscode.window.activeNotebookEditor?.notebook
    if (!activeNotebook || document.uri.scheme !== 'vscode-notebook-cell') {
        return -1
    }
    const notebookCells = getNotebookCells(activeNotebook)
    const currentCellIndex = notebookCells.findIndex(cell => cell.document === document)
    return currentCellIndex
}

export function getNotebookCells(notebook: vscode.NotebookDocument): vscode.NotebookCell[] {
    return notebook.getCells().sort((a, b) => a.index - b.index)
}

export function getActiveNotebookUri(): vscode.Uri | undefined {
    return vscode.window.activeNotebookEditor?.notebook.uri
}
