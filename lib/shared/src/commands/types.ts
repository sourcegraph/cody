// The default Cody Commands
export type DefaultCodyCommands = DefaultChatCommands | DefaultEditCommands

// Default Cody Commands that runs as a Chat request
export enum DefaultChatCommands {
    Doc = 'doc', // Generate documentation in Chat
    Explain = 'explain', // Explain code
    Unit = 'unit', // Generate unit tests in Chat
    Smell = 'smell', // Generate code smell report in Chat
    Custom = 'custom-chat', // Run custom command in Chat
}

// Default Cody Commands that runs as an Inline Edit command
export enum DefaultEditCommands {
    Test = 'test', // Generate unit tests with inline edit
    Doc = 'doc', // Generate documentation with inline edit
    Edit = 'edit', // Edit code with inline edit
    Custom = 'custom-edit', // Run custom command with inline edit
}

// The blueprint of a Cody Custom Command
export interface CodyCommand {
    /**
     * @deprecated Use 'key' instead.
     */
    slashCommand?: string
    /**
     * key of the command, e.g. 'smell' for Code Smell
     */
    key: string
    prompt: string
    description?: string
    context?: CodyCommandContext
    type?: CodyCommandType
    mode?: CodyCommandMode

    // Internal use - the ID of the request
    requestID?: string
}

/**
 * - 'ask' mode is the default mode, run prompt in chat view
 * - 'edit' mode will run prompt with edit command which replace selection with cody's response
 * - 'insert' mode is the same as edit, it adds to the top of the selection instead of replacing selection
 */
export type CodyCommandMode = 'ask' | 'edit' | 'insert'

// Type of context available for prompt building
export interface CodyCommandContext {
    // Exclude any context.
    // It takes precedence over all other context.
    none?: boolean

    // Tabs from the current workspace
    openTabs?: boolean
    // The directory with the current file opened in the editor
    currentDir?: boolean
    // The current file opened in the editor
    currentFile?: boolean
    // The current selection in the editor
    // Default to use smart selection unless set to false specifically
    selection?: boolean
    // Shell command to run to get context
    command?: string
    // The relative path of a file within your workspace root
    filePath?: string
    // The relative path of a directory within your workspace root
    directoryPath?: string

    // NOTE: Currently not supported
    // Codebase context from current codebase
    codebase?: boolean
}

export type CodyCommandType = CustomCommandType | DefaultCommandType | 'recently used'

export enum CustomCommandType {
    Workspace = 'workspace',
    User = 'user',
}

type DefaultCommandType = 'default' | 'experimental'

export interface TerminalOutputArguments {
    name: string
    selection?: string
    creationOptions?: { shellPath?: string; shellArgs?: string[] }
}
