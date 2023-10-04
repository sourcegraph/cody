import { URI } from 'vscode-uri'

import { CodyPromptContext } from '../chat/commands'
import { extractTestType } from '../chat/commands/utils'
import { getFileExtension, numResults } from '../chat/recipes/helpers'
import { CodebaseContext } from '../codebase-context'
import { ContextMessage } from '../codebase-context/messages'
import { ActiveTextEditorSelection, Editor } from '../editor'
import { NUM_CODE_RESULTS, NUM_TEXT_RESULTS } from '../prompt/constants'

export class EditorContext {
    constructor(
        private contextMessages: EditorContextMessages,
        private text: string,
        private editor: Editor,
        private codebaseContext: CodebaseContext,
        private selection: ActiveTextEditorSelection | null,
        private commandOutput?: string | null
    ) {}

    public getHumanDisplayText(text: string): string {
        const workspaceRootUri = this.editor.getWorkspaceRootUri()
        return this.contextMessages.getHumanDisplayTextWithEditorFile(text, this.selection, workspaceRootUri)
    }

    /**
     * Retrieves context messages for the prompt based on the given prompt context.
     *
     * Collects context from the codebase, open editor tabs, current directory, selected directory/file paths,
     * current editor selection, and previous terminal output. Returns the collected context messages.
     */
    public async getContextMessages(contextConfig: CodyPromptContext): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []
        const workspaceRootUri = this.editor.getWorkspaceRootUri()
        const isUnitTestRequest = extractTestType(this.text) === 'unit'

        if (contextConfig.none) {
            return []
        }

        if (contextConfig.codebase) {
            const codebaseMessages = await this.codebaseContext.getContextMessages(this.text, numResults)
            contextMessages.push(...codebaseMessages)
        }

        if (contextConfig.openTabs) {
            const openTabsMessages = await this.getEditorOpenTabsContext()
            contextMessages.push(...openTabsMessages)
        }

        if (contextConfig.currentDir) {
            const currentDirMessages = await this.getCurrentDirContext(isUnitTestRequest)
            contextMessages.push(...currentDirMessages)
        }

        if (contextConfig.directoryPath) {
            if (this.selection) {
                const dirMessages = await this.getEditorDirContext(contextConfig.directoryPath, this.selection)
                contextMessages.push(...dirMessages)
            }
        }

        if (contextConfig.filePath) {
            const fileMessages = await this.getFilePathContext(contextConfig.filePath)
            contextMessages.push(...fileMessages)
        }

        // Context for unit tests requests
        if (isUnitTestRequest && contextMessages.length === 0) {
            if (this.selection?.fileName) {
                const importsContext = await this.getUnitTestContextMessages(this.selection, workspaceRootUri)
                contextMessages.push(...importsContext)
            }
        }

        if (contextConfig.currentFile || contextConfig.selection !== false) {
            if (this.selection) {
                const currentFileMessages = this.getCurrentFileContextFromEditorSelection()
                contextMessages.push(...currentFileMessages)
            }
        }

        if (contextConfig.command) {
            const outputMessages = this.getTerminalOutputContext()
            contextMessages.push(...outputMessages)
        }

        // Return sliced results
        const maxResults = Math.floor((NUM_CODE_RESULTS + NUM_TEXT_RESULTS) / 2) * 2
        return contextMessages.slice(-maxResults * 2)
    }

    /**
     * Gets context messages from currently open editor tabs.
     */
    public async getEditorOpenTabsContext(): Promise<ContextMessage[]> {
        return this.contextMessages.getEditorOpenTabsContext()
    }

    /**
     * Gets the context messages for the current directory.
     */
    public async getCurrentDirContext(isUnitTestRequest: boolean): Promise<ContextMessage[]> {
        return this.contextMessages.getCurrentDirContext(isUnitTestRequest)
    }

    /**
     * Gets context messages for the given directory path.
     * Optionally filters results to only files matching the given selection file name.
     */
    public async getEditorDirContext(
        directoryPath: string,
        selection?: ActiveTextEditorSelection
    ): Promise<ContextMessage[]> {
        return this.contextMessages.getEditorDirContext(directoryPath, selection?.fileName)
    }

    /**
     * Gets context messages for the given file path.
     */
    public async getFilePathContext(filePath: string): Promise<ContextMessage[]> {
        return this.contextMessages.getFilePathContext(filePath)
    }

    /**
     * Gets context messages for the current open file in the editor
     * using the provided selection.
     */
    public getCurrentFileContextFromEditorSelection(): ContextMessage[] {
        return this.selection ? this.contextMessages.getCurrentFileContextFromEditorSelection(this.selection) : []
    }

    /**
     * Gets context messages for terminal output.
     *
     * @param commandOutput - The output from the terminal to add to the context.
     * @returns ContextMessage[] - The context messages containing the truncated terminal output.
     */
    public getTerminalOutputContext(): ContextMessage[] {
        return this.commandOutput ? this.contextMessages.getTerminalOutputContext(this.commandOutput) : []
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
            const rootFileNames = await this.contextMessages.getDirectoryFileListContext(workspaceRootUri, true)
            contextMessages.push(...rootFileNames)
        }
        // Add package.json content only if files matches the ts/js extension regex
        if (selection?.fileName && getFileExtension(selection?.fileName).match(/ts|js/)) {
            const packageJson = await this.contextMessages.getPackageJsonContext(selection?.fileName)
            contextMessages.push(...packageJson)
        }
        // Try adding import statements from current file as context
        if (selection?.fileName) {
            const importsContext = await this.contextMessages.getCurrentFileImportsContext()
            contextMessages.push(...importsContext)
        }

        return contextMessages
    }
}

/**
 * Interface for editor context message helpers
 * Provides methods to generate context messages from current editor state
 */
export interface EditorContextMessages {
    getEditorOpenTabsContext(skipDirectory?: string): Promise<ContextMessage[]>
    getCurrentDirContext(isUnitTestRequest: boolean): Promise<ContextMessage[]>
    getEditorDirContext(
        directoryPath: string,
        fileName?: string,
        isUnitTestRequest?: boolean
    ): Promise<ContextMessage[]>
    getFilePathContext(filePath: string): Promise<ContextMessage[]>

    getCurrentFileContextFromEditorSelection(selection: ActiveTextEditorSelection): ContextMessage[]
    getTerminalOutputContext(commandOutput: string): ContextMessage[]

    getDirectoryFileListContext(
        workspaceRootUri: URI,
        isUnitTestRequest: boolean,
        fileName?: string
    ): Promise<ContextMessage[]>

    getPackageJsonContext(fileName: string): Promise<ContextMessage[]>
    getCurrentFileImportsContext(): Promise<ContextMessage[]>

    getHumanDisplayTextWithEditorFile(
        humanInput: string,
        selectionInfo: ActiveTextEditorSelection | null,
        workspaceRoot: URI | null
    ): string
}
