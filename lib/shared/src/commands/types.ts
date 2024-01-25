// The default Cody Commands
export type DefaultCodyCommands = DefaultChatCommands | DefaultEditCommands

// Default Cody Commands that runs as a Chat request
export enum DefaultChatCommands {
    Ask = 'chat', // Submit a question in chat
    Explain = 'explain', // Explain code
    Test = 'test', // Generate unit tests in Chat
    Smell = 'smell', // Generate code smell report in Chat
}

// Default Cody Commands that runs as an Inline Edit command
export enum DefaultEditCommands {
    Edit = 'edit', // Inline edit request
    Unit = 'unit', // Generate unit tests with inline edit
    Doc = 'doc', // Generate documentation with inline edit
}

// The blueprint of a Cody Custom Command
export interface CodyCommand {
    slashCommand: string
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
 * - 'file' mode create a new file with cody's response as content
 */
type CodyCommandMode = 'ask' | 'edit' | 'insert' | 'file'

// Type of context available for prompt building
export interface CodyCommandContext {
    codebase: boolean
    openTabs?: boolean
    currentDir?: boolean
    currentFile?: boolean
    selection?: boolean
    command?: string
    output?: string
    filePath?: string
    filePaths?: string[]
    directoryPath?: string
    none?: boolean
}

export type CodyCommandType = CustomCommandType | 'default' | 'recently used' | 'experimental'

export type CustomCommandType = 'workspace' | 'user'
