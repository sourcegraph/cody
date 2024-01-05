import { dirname } from 'path'

import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { ContextMessage, getContextMessageWithResponse } from '../../../codebase-context/messages'
import { ActiveTextEditorSelection, Editor } from '../../../editor'
import { MAX_CURRENT_FILE_TOKENS } from '../../../prompt/constants'
import {
    populateCodeContextTemplate,
    populateContextTemplateFromText,
    populateCurrentEditorContextTemplate,
    populateCurrentFileFromEditorSelectionContextTemplate,
    populateImportListContextTemplate,
    populateListOfFilesContextTemplate,
    populateTerminalOutputContextTemplate,
} from '../../../prompt/templates'
import { truncateText } from '../../../prompt/truncation'
import { getFileExtension } from '../../recipes/helpers'
import { answers, displayFileName } from '../templates'

import {
    createHumanDisplayTextWithDocLink,
    createVSCodeRelativePath,
    decodeVSCodeTextDoc,
    findVSCodeFiles,
    getCurrentDirFilteredContext,
    getCurrentVSCodeDocTextByURI,
    getDirContextMessages,
    getEditorTestContext,
    getFilesFromDir,
    getFoldingRanges,
    isInWorkspace,
} from './helpers'

export class VSCodeEditorContext {
    constructor(
        private editor: Editor,
        private selection?: ActiveTextEditorSelection | null
    ) {}

    public getHumanDisplayText(humanInput: string): string {
        const workspaceRootUri = this.editor.getWorkspaceRootUri()
        const fileName = this.selection?.fileName
        if (!fileName || !this.selection) {
            return humanInput
        }

        if (!workspaceRootUri) {
            return humanInput + displayFileName + fileName
        }

        // check if fileName is a workspace file or not
        const isFileWorkspaceFile = isInWorkspace(URI.file(fileName)) !== undefined
        const fileUri = isFileWorkspaceFile ? vscode.Uri.joinPath(workspaceRootUri, fileName) : URI.file(fileName)

        // Create markdown link to the file
        return createHumanDisplayTextWithDocLink(humanInput, fileUri, this.selection)
    }

    /**
     * Gets context messages from currently open editor tabs.
     */
    public async getEditorOpenTabsContext(skipDirectory?: string): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []
        try {
            // Get open tabs from the current editor
            const tabGroups = vscode.window.tabGroups.all
            const openTabs = tabGroups.flatMap(group => group.tabs.map(tab => tab.input)) as vscode.TabInputText[]

            for (const tab of openTabs) {
                // Skip non-file URIs
                if (tab.uri.scheme !== 'file') {
                    continue
                }

                // Skip tabs in skipDirectory
                if (skipDirectory && tab.uri.fsPath.includes(skipDirectory)) {
                    continue
                }

                // Get context using file path for files not in the current workspace
                if (!isInWorkspace(tab.uri)) {
                    const contextMessage = await this.getFilePathContext(tab.uri.fsPath)
                    contextMessages.push(...contextMessage)
                    continue
                }

                // Get file name and extract context from current workspace file
                const fileUri = tab.uri
                const fileName = createVSCodeRelativePath(fileUri.fsPath)
                const fileText = await getCurrentVSCodeDocTextByURI(fileUri)
                const truncatedText = truncateText(fileText, MAX_CURRENT_FILE_TOKENS)

                // Create context message
                const message = getContextMessageWithResponse(
                    populateCurrentEditorContextTemplate(truncatedText, fileName),
                    {
                        fileName,
                    }
                )

                contextMessages.push(...message)
            }
        } catch {
            // no ops
        }

        return contextMessages
    }

    /**
     * Gets the context messages for the current directory.
     */
    public async getCurrentDirContext(isUnitTestRequest: boolean): Promise<ContextMessage[]> {
        const activeEditor = this.editor.getActiveTextEditor()
        if (!activeEditor?.fileUri) {
            return []
        }
        if (activeEditor.fileUri) {
            const currentDir = dirname(activeEditor.filePath)
            return this.getEditorDirContext(currentDir, activeEditor.filePath, isUnitTestRequest)
        }
        return []
    }

    /**
     * Gets context messages for the given directory path.
     * Optionally filters results to only files matching the given selection file name.
     */
    public async getEditorDirContext(
        directoryPath: string,
        currentFileName?: string,
        isUnitTestRequest = false
    ): Promise<ContextMessage[]> {
        let directoryUri = vscode.Uri.file(directoryPath)
        const currentWorkspaceUri = this.editor.getWorkspaceRootUri()
        // Turns relative path into absolute path
        if (currentWorkspaceUri && !directoryPath.startsWith(currentWorkspaceUri.fsPath)) {
            directoryUri = vscode.Uri.joinPath(currentWorkspaceUri, directoryPath)
        }
        const filteredFiles = await getFilesFromDir(directoryUri, isUnitTestRequest)

        if (isUnitTestRequest && currentFileName) {
            const context = await getCurrentDirFilteredContext(directoryUri, filteredFiles, currentFileName)
            if (context.length > 0) {
                return context
            }

            const testFileContext = await getEditorTestContext(currentFileName, isUnitTestRequest)
            if (testFileContext.length > 0) {
                return testFileContext
            }
        }

        // Default to first 10 files
        const firstFiles = filteredFiles.slice(0, 10)
        return getDirContextMessages(directoryUri, firstFiles)
    }

    /**
     * Gets context messages for the given file path.
     */
    public async getFilePathContext(filePath: string): Promise<ContextMessage[]> {
        const fileName = createVSCodeRelativePath(filePath)
        try {
            const decoded = await getCurrentVSCodeDocTextByURI(vscode.Uri.file(filePath))
            const truncatedContent = truncateText(decoded, MAX_CURRENT_FILE_TOKENS)
            // Make sure the truncatedContent is in JSON format
            return getContextMessageWithResponse(populateCodeContextTemplate(truncatedContent, fileName), {
                fileName,
                content: decoded,
            })
        } catch (error) {
            console.error(error)
            return []
        }
    }

    /**
     * Gets context messages for the current open file in the editor
     * using the provided selection.
     */
    public getCurrentFileContextFromEditorSelection(): ContextMessage[] {
        if (!this.selection?.selectedText) {
            return []
        }

        return getContextMessageWithResponse(
            populateCurrentFileFromEditorSelectionContextTemplate(this.selection, this.selection.fileName),
            this.selection,
            answers.file
        )
    }

    /**
     * Gets context messages for terminal output.
     */
    public getTerminalOutputContext(commandOutput: string): ContextMessage[] {
        if (!commandOutput.trim()) {
            return []
        }
        const truncatedTerminalOutput = truncateText(commandOutput, MAX_CURRENT_FILE_TOKENS)

        return [
            { speaker: 'human', text: populateTerminalOutputContextTemplate(truncatedTerminalOutput) },
            {
                speaker: 'assistant',
                text: answers.terminal,
            },
        ]
    }

    /**
     * Gets context messages specific to unit test files.
     *
     * This includes the root directory file list, package.json,
     * and import statements from the current file if applicable.
     */
    public async getUnitTestContextMessages(
        selection: ActiveTextEditorSelection,
        workspaceRootUri?: URI | null
    ): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []

        if (workspaceRootUri) {
            const rootFileNames = await this.getDirectoryFileListContext(workspaceRootUri, true)
            contextMessages.push(...rootFileNames)
        }
        // Add package.json content only if files matches the ts/js extension regex
        if (selection?.fileName && getFileExtension(selection?.fileName).match(/ts|js/)) {
            const packageJson = await this.getPackageJsonContext(selection?.fileName)
            contextMessages.push(...packageJson)
        }
        // Try adding import statements from current file as context
        if (selection?.fileName) {
            const importsContext = await this.getCurrentFileImportsContext()
            contextMessages.push(...importsContext)
        }

        return contextMessages
    }

    public async getDirectoryFileListContext(
        workspaceRootUri: URI,
        isTestRequest: boolean,
        fileName?: string
    ): Promise<ContextMessage[]> {
        try {
            if (!workspaceRootUri) {
                throw new Error('No workspace root found')
            }

            const fileUri = fileName ? vscode.Uri.joinPath(workspaceRootUri, fileName) : workspaceRootUri
            const directoryUri = fileName ? vscode.Uri.joinPath(fileUri, '..') : workspaceRootUri
            const directoryFiles = await getFilesFromDir(directoryUri, isTestRequest)
            const fileNames = directoryFiles.map(file => file[0])
            const truncatedFileNames = truncateText(fileNames.join(', '), MAX_CURRENT_FILE_TOKENS)
            const fsPath = fileName || 'root'

            return [
                {
                    speaker: 'human',
                    text: populateListOfFilesContextTemplate(truncatedFileNames, fsPath),
                },
                {
                    speaker: 'assistant',
                    text: answers.fileList.replace('{fileName}', fsPath),
                },
            ]
        } catch (error) {
            console.error(error)
            return []
        }
    }

    public async getPackageJsonContext(filePath: string): Promise<ContextMessage[]> {
        const currentFilePath = filePath
        if (!currentFilePath) {
            return []
        }
        // Search for the package.json from the base path
        const packageJsonPath = await findVSCodeFiles('**/package.json', undefined, 1)
        if (!packageJsonPath.length) {
            return []
        }
        try {
            const packageJsonUri = packageJsonPath[0]
            const decoded = await decodeVSCodeTextDoc(packageJsonUri)
            // Turn the content into a json and get the scripts object only
            const packageJson = JSON.parse(decoded) as Record<string, unknown>
            const scripts = packageJson.scripts
            const devDependencies = packageJson.devDependencies
            // stringify the scripts object with devDependencies
            const context = JSON.stringify({ scripts, devDependencies })
            const truncatedContent = truncateText(context.toString() || decoded.toString(), MAX_CURRENT_FILE_TOKENS)
            const fileName = createVSCodeRelativePath(packageJsonUri.fsPath)
            const templateText =
                'Here are the scripts and devDependencies from the package.json file for the codebase: '

            return getContextMessageWithResponse(
                populateContextTemplateFromText(templateText, truncatedContent, fileName),
                { fileName },
                answers.packageJson
            )
        } catch {
            return []
        }
    }

    public async getCurrentFileImportsContext(): Promise<ContextMessage[]> {
        const fileUri = this.selection?.fileUri
        if (!fileUri) {
            return []
        }
        try {
            const lastImportRange = await getFoldingRanges(fileUri, 'imports', true)
            const lastImportLineRange = lastImportRange?.[0]
            if (!lastImportLineRange) {
                return []
            }

            // Get the line number of the last import statement
            const lastImportLine = lastImportLineRange.end
            const importsRange = new vscode.Range(0, 0, lastImportLine, 0)
            // create editor with file uri
            const editor = await vscode.workspace.openTextDocument(fileUri)
            const importStatements = editor.getText(importsRange)
            if (!importStatements) {
                return []
            }

            const truncatedContent = truncateText(importStatements, MAX_CURRENT_FILE_TOKENS / 2)
            const fileName = createVSCodeRelativePath(editor?.fileName)

            return getContextMessageWithResponse(populateImportListContextTemplate(truncatedContent, fileName), {
                fileName,
            })
        } catch {
            return []
        }
    }
}
