import path from 'path'

import * as vscode from 'vscode'

import { CURSOR } from '../constants'
import { DatasetConfig } from '../utils'

import { ensureExecuteCommand } from './helpers'

/**
 * Polls the VS Command `editor.action.inlineSuggest.commit` every 100ms in order to attempt to accept a completion.
 * Resolves when we have any document change.
 * Ideally we could listen directly to the inlineCompletionItem provider through VS Code, but this is not currently possible.
 * Related GitHub issue: https://github.com/microsoft/vscode-discussions/discussions/483
 */
export const pollToAcceptCompletion = async (originalDocumentVersion: number): Promise<boolean> => {
    await ensureExecuteCommand('editor.action.inlineSuggest.commit')
    await new Promise(resolve => setTimeout(resolve, 100))

    if (!vscode.window.activeTextEditor) {
        throw new Error('Unable to access the active text editor')
    }

    // If the document version has changed, an edit must have occurred
    if (vscode.window.activeTextEditor.document.version === originalDocumentVersion) {
        return pollToAcceptCompletion(originalDocumentVersion)
    }

    return true
}

export const executeCompletion = async ({ entryFile, openFiles }: DatasetConfig, cwd: string): Promise<void> => {
    for (const fileToOpen of openFiles) {
        // Open any relevant 'open` files that can be used as additional context
        const doc = await vscode.workspace.openTextDocument(path.resolve(cwd, fileToOpen))
        await vscode.window.showTextDocument(doc, { preview: false })
    }

    const entryDocument = await vscode.workspace.openTextDocument(path.resolve(cwd, entryFile))
    const entryEditor = await vscode.window.showTextDocument(entryDocument)

    // Set the cursor position to the top of the opened file.
    // It seems this is required to ensure Cody is aware of the file and can start fetching context based on the editor selection.
    // TODO(umpox): Investigate if this is a bug with how we build context from the cursor, or if this is a quirk with these tests.
    const topOfFilePosition = new vscode.Position(0, 0)
    entryEditor.selection = new vscode.Selection(topOfFilePosition, topOfFilePosition)
    await new Promise(resolve => setTimeout(resolve, 500))

    // Find the `CURSOR` placeholder, remove it, and place the actual cursor there
    const cursorPosition = entryEditor.document.positionAt(entryEditor.document.getText().indexOf(CURSOR))
    const cursorSelection = new vscode.Selection(cursorPosition.translate(0, 1), cursorPosition.translate(0, 1))
    entryEditor.selection = cursorSelection
    await ensureExecuteCommand('deleteLeft')

    // We add a short delay to allow fetching any specific context for this selection
    await new Promise(resolve => setTimeout(resolve, 500))

    const startPolling = pollToAcceptCompletion(entryEditor.document.version)
    await Promise.race([
        startPolling,
        new Promise<false>(resolve => setTimeout(() => resolve(false), 5000)), // Maximum 5s wait
    ])

    await entryEditor.document.save()
}
