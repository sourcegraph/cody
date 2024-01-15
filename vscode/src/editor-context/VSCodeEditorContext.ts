import { dirname } from 'path'

import * as vscode from 'vscode'
import { type URI } from 'vscode-uri'

import { getFileExtension } from '@sourcegraph/cody-shared/src/chat/recipes/helpers'
import {
    getContextMessageWithResponse,
    type ContextMessage,
} from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { type ActiveTextEditorSelection } from '@sourcegraph/cody-shared/src/editor'
import { MAX_CURRENT_FILE_TOKENS } from '@sourcegraph/cody-shared/src/prompt/constants'
import {
    populateCodeContextTemplate,
    populateContextTemplateFromText,
    populateCurrentEditorContextTemplate,
    populateCurrentEditorSelectedContextTemplate,
    populateImportListContextTemplate,
    populateListOfFilesContextTemplate,
    populateTerminalOutputContextTemplate,
} from '@sourcegraph/cody-shared/src/prompt/templates'
import { truncateText } from '@sourcegraph/cody-shared/src/prompt/truncation'

import { answers } from '../commands/prompt/templates'
import { type VSCodeEditor } from '../editor/vscode-editor'

import {
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
        private editor: VSCodeEditor,
        private selection?: ActiveTextEditorSelection | null
    ) {}

    public getEditorSelectionContext(): ContextMessage[] {
        const fileText = this.selection?.selectedText.trim()
        const fileUri = this.selection?.fileUri
        if (!fileText || !fileUri) {
            return []
        }
        const truncatedText = truncateText(fileText, MAX_CURRENT_FILE_TOKENS)
        // Create context message
        const contextMessage = getContextMessageWithResponse(
            populateCurrentEditorSelectedContextTemplate(truncatedText, fileUri),
            {
                type: 'file',
                uri: fileUri,
                content: truncatedText,
                source: 'selection',
                range: this.selection?.selectionRange || undefined,
            }
        )

        return contextMessage
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
                    const contextMessage = await this.getFilePathContext(tab.uri)
                    contextMessages.push(...contextMessage)
                    continue
                }

                // Get file name and extract context from current workspace file
                const fileUri = tab.uri
                const fileText = await getCurrentVSCodeDocTextByURI(fileUri)
                const truncatedText = truncateText(fileText, MAX_CURRENT_FILE_TOKENS)
                const range = new vscode.Range(0, 0, truncatedText.split('\n').length, 0)

                // Create context message
                const message = getContextMessageWithResponse(
                    populateCurrentEditorContextTemplate(truncatedText, fileUri),
                    {
                        type: 'file',
                        uri: fileUri,
                        content: truncatedText,
                        source: 'editor',
                        range,
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
        if (activeEditor.fileUri && activeEditor.fileUri.scheme === 'file') {
            const currentDir = dirname(activeEditor.fileUri.fsPath)
            return this.getEditorDirContext(currentDir, activeEditor.fileUri, isUnitTestRequest)
        }
        return []
    }

    /**
     * Gets context messages for the given directory path.
     * Optionally filters results to only files matching the given selection file name.
     */
    public async getEditorDirContext(
        directoryPath: string,
        currentFile?: vscode.Uri,
        isUnitTestRequest = false
    ): Promise<ContextMessage[]> {
        let directoryUri = vscode.Uri.file(directoryPath)
        const currentWorkspaceUri = this.editor.getWorkspaceRootUri()
        // Turns relative path into absolute path
        if (currentWorkspaceUri && !directoryPath.startsWith(currentWorkspaceUri.fsPath)) {
            directoryUri = vscode.Uri.joinPath(currentWorkspaceUri, directoryPath)
        }
        const filteredFiles = await getFilesFromDir(directoryUri, isUnitTestRequest)

        if (isUnitTestRequest && currentFile) {
            const context = await getCurrentDirFilteredContext(directoryUri, filteredFiles, currentFile)
            if (context.length > 0) {
                return context
            }

            const testFileContext = await getEditorTestContext(currentFile, isUnitTestRequest)
            if (testFileContext.length > 0) {
                return testFileContext
            }
        }

        // Default to first 10 files
        const firstFiles = filteredFiles.slice(0, 10)
        return getDirContextMessages(directoryUri, firstFiles)
    }

    /**
     * Gets context messages for the given file.
     */
    public async getFilePathContext(file: vscode.Uri): Promise<ContextMessage[]> {
        try {
            const decoded = await getCurrentVSCodeDocTextByURI(file)
            const truncatedContent = truncateText(decoded, MAX_CURRENT_FILE_TOKENS)
            const range = new vscode.Range(0, 0, truncatedContent.split('\n').length, 0)
            // Make sure the truncatedContent is in JSON format
            return getContextMessageWithResponse(populateCodeContextTemplate(truncatedContent, file), {
                type: 'file',
                content: decoded,
                uri: file,
                source: 'editor',
                range,
            })
        } catch (error) {
            console.error(error)
            return []
        }
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
            {
                speaker: 'human',
                text: populateTerminalOutputContextTemplate(truncatedTerminalOutput),
                file: {
                    type: 'file',
                    content: commandOutput,
                    title: 'Terminal Output',
                    uri: vscode.Uri.file('terminal-output'),
                    source: 'terminal',
                },
            },
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
        if (selection?.fileUri && getFileExtension(selection?.fileUri).match(/ts|js/)) {
            const packageJson = await this.getPackageJsonContext()
            contextMessages.push(...packageJson)
        }
        // Try adding import statements from current file as context
        if (selection?.fileUri) {
            const importsContext = await this.getCurrentFileImportsContext()
            contextMessages.push(...importsContext)
        }

        return contextMessages
    }

    private async getDirectoryFileListContext(
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

            return [
                {
                    speaker: 'human',
                    text: populateListOfFilesContextTemplate(truncatedFileNames, fileUri),
                    file: {
                        type: 'file',
                        uri: fileUri,
                        content: truncatedFileNames,
                        source: 'editor',
                    },
                },
                {
                    speaker: 'assistant',
                    text: answers.fileList.replace('{fileName}', fileName ?? 'root'),
                },
            ]
        } catch (error) {
            console.error(error)
            return []
        }
    }

    private async getPackageJsonContext(): Promise<ContextMessage[]> {
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
            const templateText =
                'Here are the scripts and devDependencies from the package.json file for the codebase: '

            return getContextMessageWithResponse(
                populateContextTemplateFromText(templateText, truncatedContent, packageJsonUri),
                { type: 'file', uri: packageJsonUri, content: truncatedContent, source: 'editor' },
                answers.packageJson
            )
        } catch {
            return []
        }
    }

    private async getCurrentFileImportsContext(): Promise<ContextMessage[]> {
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

            return getContextMessageWithResponse(populateImportListContextTemplate(truncatedContent, fileUri), {
                type: 'file',
                uri: fileUri,
                content: truncatedContent,
                range: importsRange,
                source: 'editor',
            })
        } catch {
            return []
        }
    }
}
