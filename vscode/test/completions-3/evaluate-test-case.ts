import { execSync } from 'child_process'
import path from 'path'

import * as vscode from 'vscode'

import { TEST_WORKSPACE_PATH } from './constants'
import { CURSOR, EvaluationFiles } from './create-evaluation-cases'
import { ensureExecuteCommand } from './helpers'

export enum CaseStatus {
    'PASS',
    'FAIL',
    'TIMED_OUT',
}

export interface CaseResult {
    status: CaseStatus
    editSimilarity: number | null
    exactMatch: number | null
}

export const testCompletionResult = (testPath: string): CaseStatus.PASS | CaseStatus.FAIL => {
    let status: CaseStatus
    try {
        execSync(`python ${testPath}`, { cwd: TEST_WORKSPACE_PATH, stdio: 'inherit' })
        status = CaseStatus.PASS
    } catch {
        status = CaseStatus.FAIL
    }
    return status
}

/**
 * Polls the VS Command `editor.action.inlineSuggest.commit` every 50ms in order to attempt to accept a completion.
 * This will exit when we either have a valid document change, or reach the maximum timeout.
 * Ideally we could listen directly to the inlineCompletionItem provider through VS Code, but this is not currently possible.
 * Related GitHub discussion: https://github.com/microsoft/vscode-discussions/discussions/483
 */
export const pollToAcceptCompletion = async (originalDocumentVersion: number): Promise<boolean> => {
    await ensureExecuteCommand('editor.action.inlineSuggest.commit')
    await new Promise(resolve => setTimeout(resolve, 50))

    if (!vscode.window.activeTextEditor) {
        throw new Error('Unable to access the active text editor')
    }
    if (vscode.window.activeTextEditor.document.version === originalDocumentVersion) {
        return pollToAcceptCompletion(originalDocumentVersion)
    }

    return true
}

export const evaluateCompletion = async (id: string, files: EvaluationFiles): Promise<CaseResult> => {
    const generatedPath = path.resolve(files.generationFile)
    const testPath = path.resolve(files.testFile)
    const solutionPath = path.resolve(files.solutionFile)
    if (!generatedPath || !testPath || !solutionPath) {
        throw new Error(`Invalid test case configuration - ${id}`)
    }

    // Find the placeholder symbol, replace it and update the selection for the completion
    const document = await vscode.workspace.openTextDocument(generatedPath)
    const searchResult = document.getText().indexOf(CURSOR)
    const cursorPosition = document.positionAt(searchResult)
    const cursorRange = new vscode.Range(cursorPosition, cursorPosition.translate(0, 1))
    const editor = await vscode.window.showTextDocument(document)
    await editor.edit(edit => {
        edit.replace(cursorRange, '')
    })
    editor.selection = new vscode.Selection(cursorPosition, cursorPosition)

    // TODO: Delay for completion trigger?
    await new Promise(resolve => setTimeout(resolve, 200))

    const startPolling = pollToAcceptCompletion(editor.document.version)
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
    const completion = await Promise.race([
        startPolling,
        new Promise<false>(resolve => setTimeout(() => resolve(false), 5000)), // Maximum 5000ms wait
    ])
    await document.save()

    if (!completion) {
        return {
            status: CaseStatus.TIMED_OUT,
            editSimilarity: 0,
            exactMatch: 0,
        }
    }

    const testStatus = testCompletionResult(testPath)
    const editSimilarity = 1
    const exactMatch = 1

    return {
        status: testStatus,
        editSimilarity,
        exactMatch,
    }
}
