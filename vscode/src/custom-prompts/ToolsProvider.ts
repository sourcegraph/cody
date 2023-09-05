import { exec } from 'child_process'
import os from 'os'
import { promisify } from 'util'

import * as vscode from 'vscode'

import { logDebug, logError } from '../log'

import { UserWorkspaceInfo } from './utils'
import { outputWrapper } from './utils/helpers'

const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath
const currentFilePath = vscode.window.activeTextEditor?.document.uri.fsPath
const homePath = os.homedir() || process.env.HOME || process.env.USERPROFILE || ''
const _exec = promisify(exec)
/**
 * Provides utility methods and tools for working with the file system, running commands,
 * and getting user/workspace info.
 */
export class ToolsProvider {
    private user: UserWorkspaceInfo
    private shell = vscode.env.shell

    constructor(public context: vscode.ExtensionContext) {
        this.user = this.getUserInfo()
    }

    /**
     * Get the user's workspace info
     */
    public getUserInfo(): UserWorkspaceInfo {
        if (this.user?.workspaceRoot) {
            return this.user
        }
        const appRoot = vscode.env.appRoot
        return {
            homeDir: homePath,
            workspaceRoot: rootPath,
            currentFilePath,
            appRoot,
        }
    }

    /**
     * Open a file in the editor
     */
    public async openFile(uri?: vscode.Uri): Promise<void> {
        return vscode.commands.executeCommand('vscode.open', uri)
    }

    /**
     * Open a folder in the file explorer
     */
    public async openFolder(): Promise<void> {
        await vscode.commands.executeCommand('vscode.openFolder', rootPath)
    }

    /**
     * Execute a command in the terminal
     */
    public async exeCommand(command: string, runFromWSRoot = true): Promise<string | undefined> {
        if (!this.shell) {
            void vscode.window.showErrorMessage('Shell command is not supported your current workspace.')
            return
        }
        // Expand the ~/ in command with the home directory if any of the substring starts with ~/ with a space before it
        const homeDir = this.user.homeDir + '/' || ''
        const filteredCommand = command.replace(/(\s~\/)/g, ` ${homeDir}`)
        try {
            const { stdout, stderr } = await _exec(filteredCommand, {
                cwd: runFromWSRoot ? rootPath : currentFilePath,
                encoding: 'utf8',
            })
            const output = stdout || stderr
            // stringify the output of the command first
            const outputString = JSON.stringify(output.trim())
            if (!outputString) {
                throw new Error('Empty output')
            }
            logDebug('ToolsProvider:exeCommand', command, { verbose: outputString })
            return outputWrapper.replace('{command}', command).replace('{output}', outputString)
        } catch (error) {
            logError('ToolsProvider:exeCommand', 'failed', { verbose: error })
            void vscode.window.showErrorMessage(
                'Failed to run command. Please make sure the command works in your terminal before trying again.'
            )
        }
        return
    }

    /**
     * Check if a file exists
     */
    public async doesUriExist(uri?: vscode.Uri): Promise<boolean> {
        if (!uri) {
            return false
        }
        try {
            return (uri && !!(await vscode.workspace.fs.stat(uri))) || false
        } catch {
            return false
        }
    }

    /**
     * Adds content to a test file.
     *
     * @param content - The content to add to the test file. This should contain the file name tags and code blocks.
     * @param currentFileName - The path of the current file. Used to determine the path for the test file.
     *
     * This extracts the test file name from the content, gets the code blocks, builds the test file path from the current file name,
     * checks if the test file already exists, and creates a new test file with the code blocks as content if it doesn't exist.
     *
     * It also handles opening an existing test file and adding the content to a temporary file.
     */
    public async addContentToTestFile(content: string, currentFileName: string): Promise<void> {
        const codeBlockRegex = /```[\S\s]*?```/g
        // the file name is in the <fileName></fileName> tags in the content
        const testFileName = content
            .match(/<fileName>(.*?)<\/fileName>/)?.[1]
            ?.split('/')
            .pop()
        const codeBlocks = content.match(codeBlockRegex)?.join('\n')
        // remove all the opening backticks with language name and closing backticks from the content ex: ```go CODE ```
        const testContent = codeBlocks?.replaceAll(/```.*\n/g, '').replaceAll('```', '')
        if (!testContent) {
            return
        }
        // Create a workspace uri for the test file, the test file should locate in the same directory as current file
        // add the test file name to the directory that the current file is in
        const testFilePath = currentFileName.replace(/\/[^/]+$/, `/${testFileName}`)
        // Create workspace file uri for the test file path, add workspace root path to the file path
        const workspaceRootPath = this.getUserInfo().workspaceRoot || ''
        const testFileUri = vscode.Uri.joinPath(vscode.Uri.parse(workspaceRootPath), testFilePath)
        const testFileExists = await this.doesUriExist(testFileUri)
        if (!testFileExists && testFileName) {
            await this.createNewFile(testFileUri, testContent)
            return
        }

        const document = await vscode.workspace.openTextDocument(testFileUri)
        const language = document.languageId || ''

        // Create a temporary file in current editor and add content to the file
        await this.createTempFile([testFileName, testContent].join('\n'), language)
        return
    }

    /**
     * Creates a new file if it doesn't already exist and adds content to it.
     *
     * @param fileUri - The URI of the file to create.
     * @param content - Optional content to add to the new file.
     *
     * This first checks if the file exists, and creates it if not.
     * Then it opens the file, inserts the content at the end, saves the file,
     * and opens the document in the editor.
     */
    private async createNewFile(fileUri: vscode.Uri, content?: string): Promise<void> {
        const workspaceEditor = new vscode.WorkspaceEdit()
        workspaceEditor.createFile(fileUri, { ignoreIfExists: true })
        if (!content) {
            return
        }
        await vscode.workspace.applyEdit(workspaceEditor)
        const textDocument = await vscode.workspace.openTextDocument(fileUri)
        workspaceEditor.insert(fileUri, new vscode.Position(textDocument.lineCount + 1, 0), content)
        await vscode.workspace.applyEdit(workspaceEditor)
        await textDocument.save()
        await vscode.window.showTextDocument(fileUri)
    }

    /**
     * Creates a temporary file with the given content and language.
     *
     * @param content - The content to add to the temporary file.
     * @param language - The language of the temporary file.
     *
     * Opens a new text document with the given content and language,
     * then shows that document in a new editor tab.
     */
    private async createTempFile(content: string, language: string): Promise<void> {
        const tempFile = await vscode.workspace.openTextDocument({
            content: content.trim(),
            language,
        })
        await vscode.window.showTextDocument(tempFile)
    }
}
