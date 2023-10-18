import path from 'path'

import * as vscode from 'vscode'

import { CODY_EXTENSION_ID, CURSOR } from '../constants'
import { BENCHMARK_AUTOMATIC_COMPLETIONS } from '../env'
import { BenchmarkResult, DatasetConfig } from '../utils'

import { BENCHMARK_EXTENSION_ID } from './env'
import { ensureExecuteCommand } from './helpers'

/**
 * Polls the VS Command `editor.action.inlineSuggest.commit` every 50ms in order to attempt to accept a completion.
 * Resolves when we have any document change.
 * Ideally we could listen directly to the inlineCompletionItem provider through VS Code, but this is not currently possible.
 * Related GitHub issue: https://github.com/microsoft/vscode-discussions/discussions/483
 */
const acceptCompletion = async (currentVersion: number): Promise<boolean> => {
    await ensureExecuteCommand('editor.action.inlineSuggest.commit')
    await new Promise(resolve => setTimeout(resolve, 50))

    if (!vscode.window.activeTextEditor) {
        throw new Error('Unable to access the active text editor')
    }

    // If the document version has changed, an edit must have occurred
    if (vscode.window.activeTextEditor.document.version === currentVersion) {
        return acceptCompletion(currentVersion)
    }

    return true
}

const triggerAndWaitForCompletion = async (
    editor: vscode.TextEditor
): Promise<Omit<BenchmarkResult, 'workspacePath'>> => {
    const cursorPosition = editor.document.positionAt(editor.document.getText().indexOf(CURSOR))

    if (BENCHMARK_AUTOMATIC_COMPLETIONS) {
        editor.selection = new vscode.Selection(cursorPosition.translate(0, 1), cursorPosition.translate(0, 1))

        // We add a short delay to allow fetching any specific context for this selection
        await new Promise(resolve => setTimeout(resolve, 500))

        // Trigger an automatic completion by manually deleting the placeholder text
        await ensureExecuteCommand('deleteLeft')
    } else {
        await editor.edit(edit => edit.delete(new vscode.Selection(cursorPosition, cursorPosition.translate(0, 1))))
        editor.selection = new vscode.Selection(cursorPosition, cursorPosition)

        // We add a short delay to allow fetching any specific context for this selection
        await new Promise(resolve => setTimeout(resolve, 500))

        // Trigger an manual completion by executing the relevant command
        await vscode.commands.executeCommand(
            BENCHMARK_EXTENSION_ID === CODY_EXTENSION_ID
                ? 'cody.autocomplete.manual-trigger'
                : 'editor.action.inlineSuggest.trigger'
        )
    }

    const startTime = performance.now()
    const completed = await Promise.race<boolean>([
        acceptCompletion(editor.document.version),
        new Promise(resolve => setTimeout(() => resolve(false), 5000)), // Maximum 5s wait
    ])
    const endTime = performance.now()

    // Save the changes so we can test it later
    await editor.document.save()

    return {
        completed,
        timeToCompletion: completed ? endTime - startTime : undefined,
    }
}

export const executeCompletion = async (
    { entryFile, openFiles = [] }: DatasetConfig,
    cwd: string
): Promise<Omit<BenchmarkResult, 'workspacePath'>> => {
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

    return triggerAndWaitForCompletion(entryEditor)
}
