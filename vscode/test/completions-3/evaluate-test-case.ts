import { exec as _exec } from 'child_process'
import { copyFile, mkdir, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'

import * as vscode from 'vscode'

import { TEST_WORKSPACE_PATH } from './constants'
import { CURSOR } from './create-evaluation-cases'
import { DatasetConfig } from './datasets'
import { ensureExecuteCommand } from './helpers'

const exec = promisify(_exec)

export enum CaseStatus {
    'PASS',
    'FAIL',
    'TIMED_OUT',
}

export interface CaseResult {
    status: CaseStatus
}

export const testCompletionResult = async (
    testFile: string,
    testCommand: string,
    cwd: string
): Promise<CaseStatus.PASS | CaseStatus.FAIL> => {
    let status: CaseStatus
    try {
        await exec(`${testCommand} ${testFile}`, { cwd })
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
    await new Promise(resolve => setTimeout(resolve, 100))

    if (!vscode.window.activeTextEditor) {
        throw new Error('Unable to access the active text editor')
    }
    if (vscode.window.activeTextEditor.document.version === originalDocumentVersion) {
        return pollToAcceptCompletion(originalDocumentVersion)
    }

    return true
}

const copyFileToWorkspace = async (workspaceDir: string, fileName: string, cwd: string): Promise<void> => {
    const filePath = path.join(cwd, fileName)
    const tempFilePath = path.join(workspaceDir, path.basename(filePath))
    await copyFile(filePath, tempFilePath)
}

const createTemporaryWorkspace = async (filePaths: string[], cwd: string): Promise<string> => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'cody-evaluation-'))
    for (const file of filePaths) {
        await copyFileToWorkspace(tempDir, file, cwd)
    }

    // Add the hardcoded workspace settings too
    const tempVsCodeConfigPath = path.join(tempDir, '.vscode')
    const existingVsCodeConfig = path.join(TEST_WORKSPACE_PATH, '.vscode')
    await mkdir(path.join(tempDir, '.vscode'))
    await copyFileToWorkspace(tempVsCodeConfigPath, 'settings.json', existingVsCodeConfig)

    // Create a Git repo and commit the copied files. This will give us a useful way to compare any future changes.
    await exec('git init --quiet', { cwd: tempDir })
    await exec('git add --all', { cwd: tempDir })
    await exec('git commit -m "init"', { cwd: tempDir })

    return tempDir
}

export const executeCompletionOnFile = async (
    entryFile: string,
    openFiles: string[],
    cwd: string
): Promise<boolean> => {
    for (const fileToOpen of openFiles) {
        // TODO: Check files are open and available for context
        const doc = await vscode.workspace.openTextDocument(path.resolve(cwd, fileToOpen))
        await vscode.window.showTextDocument(doc, { preview: false })
    }
    const entryDocument = await vscode.workspace.openTextDocument(path.resolve(cwd, entryFile))
    // Find the placeholder symbol, replace it and update the selection for the completion
    const editor = await vscode.window.showTextDocument(entryDocument)
    const searchResult = editor.document.getText().indexOf(CURSOR)
    const cursorPosition = editor.document.positionAt(searchResult)
    const cursorRange = new vscode.Range(cursorPosition, cursorPosition.translate(0, 1))
    await editor.edit(edit => {
        edit.replace(cursorRange, '')
    })
    editor.selection = new vscode.Selection(cursorPosition, cursorPosition)

    // TODO: Delay for completion trigger?
    await new Promise(resolve => setTimeout(resolve, 500))

    const startPolling = pollToAcceptCompletion(editor.document.version)
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
    const completed = await Promise.race([
        startPolling,
        new Promise<false>(resolve => setTimeout(() => resolve(false), 10000)), // Maximum 10s wait
    ])
    await editor.document.save()
    return completed
}

export const evaluateCompletion = async (
    id: string,
    evalCaseConfig: DatasetConfig,
    cwd: string
): Promise<CaseStatus> => {
    // Copy the entry file into a temporary Git directory
    // This gives us an isolated place where we can allow Cody to make changes, and inspect them later
    // TODO: Deduplicate files
    const tempWorkspace = await createTemporaryWorkspace(
        [evalCaseConfig.entryFile, ...evalCaseConfig.openFiles, ...evalCaseConfig.additionalFiles],
        cwd
    )

    // Open the relevant files and trigger a completion in the entry file
    const completed = await executeCompletionOnFile(evalCaseConfig.entryFile, evalCaseConfig.openFiles, tempWorkspace)

    // We didn't get a completion within the allocated time, we should output this differently for further investigation.
    if (!completed) {
        console.log(`⏳ ${id} - ${tempWorkspace} (TIMED OUT)`)
        return CaseStatus.TIMED_OUT
    }

    // Copy the test file. We do this after the evaluation is completed to ensure there is no chance it is included as context.    await copyFileToWorkspace()
    await copyFileToWorkspace(tempWorkspace, evalCaseConfig.testFile, cwd)

    // Run the test file against the generated completion
    const testOutcome = await testCompletionResult(evalCaseConfig.testFile, evalCaseConfig.testCommand, tempWorkspace)

    // Copy the solution file. This is primarily so we can compare the generation vs the solution.
    // In the future we may also want to produce edit similarity (ES) and exact match (EM) metrics for further inspection.
    await copyFileToWorkspace(tempWorkspace, evalCaseConfig.solutionFile, cwd)

    if (testOutcome === CaseStatus.FAIL) {
        console.log(`🔴 ${id} - ${tempWorkspace}`)
        // Also print the diff for quick evaluation
        const diff = (
            await exec(`git diff --color=always -U0 ${evalCaseConfig.entryFile} | tail -n +5`, { cwd: tempWorkspace })
        ).stdout
        console.log(diff)
    } else {
        console.log(`🟢 ${id} - ${tempWorkspace}`)
    }

    return testOutcome
}
