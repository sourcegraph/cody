import { writeFileSync } from 'fs'
import path from 'path'

import * as vscode from 'vscode'

import { BENCHMARK_EXTENSION_ID } from './config'
import { CODY_EXTENSION_CHANNEL_ID, CODY_EXTENSION_ID, CURSOR } from './constants'
import { DatasetConfig } from './datasets'
import { ensureExecuteCommand } from './helpers'

/**
 * Polls the VS Command `editor.action.inlineSuggest.commit` every 50ms in order to attempt to accept a completion.
 * This will exit when we either have a valid document change, or reach the maximum timeout.
 * Ideally we could listen directly to the inlineCompletionItem provider through VS Code, but this is not currently possible.
 * Related GitHub discussion: https://github.com/microsoft/vscode-discussions/discussions/483
 */
export const pollToAcceptCompletion = async (originalDocumentVersion: number): Promise<boolean> => {
    await ensureExecuteCommand('editor.action.inlineSuggest.commit')
    await new Promise(resolve => setTimeout(resolve, 100))

    if (!vscode.window.activeTextEditor) {
        throw new Error('Unable to access the active text editor')
    }
    if (vscode.window.activeTextEditor.document.version === originalDocumentVersion) {
        return pollToAcceptCompletion(originalDocumentVersion)
    }

    return true
}

export const executeCompletionOnFile = async (
    entryFile: string,
    openFiles: string[],
    cwd: string
): Promise<boolean> => {
    for (const fileToOpen of openFiles) {
        const doc = await vscode.workspace.openTextDocument(path.resolve(cwd, fileToOpen))
        await vscode.window.showTextDocument(doc, { preview: false })
    }

    const entryDocument = await vscode.workspace.openTextDocument(path.resolve(cwd, entryFile))
    const editor = await vscode.window.showTextDocument(entryDocument)

    // // Get the position of the placeholder `CURSOR` symbol
    const cursorPosition = editor.document.positionAt(editor.document.getText().indexOf(CURSOR))
    const cursorSelection = new vscode.Selection(cursorPosition.translate(0, 1), cursorPosition.translate(0, 1))
    editor.selection = cursorSelection
    await vscode.commands.executeCommand('deleteLeft')
    await new Promise(resolve => setTimeout(resolve, 750))

    const startPolling = pollToAcceptCompletion(editor.document.version)
    const completed = await Promise.race([
        startPolling,
        new Promise<false>(resolve => setTimeout(() => resolve(false), 5000)), // Maximum 5s wait
    ])

    await editor.document.save()

    return completed
}

export const executeCompletion = async (
    id: string,
    evalCaseConfig: DatasetConfig,
    cwd: string,
    tempWorkspace: string
): Promise<void> => {
    // Open the relevant files and trigger a completion in the entry file
    await executeCompletionOnFile(evalCaseConfig.entryFile, evalCaseConfig.openFiles, tempWorkspace)

    if (BENCHMARK_EXTENSION_ID === CODY_EXTENSION_ID) {
        // Dump the output of the extension to a file
        await ensureExecuteCommand(`workbench.action.output.show.${CODY_EXTENSION_CHANNEL_ID}`)
        await new Promise(resolve => setTimeout(resolve, 100)) // Ensure open

        const channelOutput = vscode.window.visibleTextEditors.find(
            ({ document }) => document.fileName === CODY_EXTENSION_CHANNEL_ID
        )
        if (channelOutput) {
            writeFileSync(path.join(tempWorkspace, 'output.log'), channelOutput.document.getText(), 'utf8')
        }

        await ensureExecuteCommand('workbench.output.action.clearOutput')
        // Additional time to ensure it is cleared
        await new Promise(resolve => setTimeout(resolve, 100))
    }
}
