// A list of default cody commands
export type CodyDefaultCommands = 'ask' | 'doc' | 'edit' | 'explain' | 'smell' | 'test' | 'reset'

// The blueprint of a Cody Command
export interface CodyCommand {
    requestID?: string
    description?: string
    prompt: string
    context?: CodyCommandContext
    type?: CodyCommandType
    slashCommand: string
    mode?: CodyCommandMode
    additionalInput?: string
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

type CodyCommandType = CustomCommandType | 'default' | 'recently used' | 'experimental'

export type CustomCommandType = 'workspace' | 'user'

export const defaultCodyCommandContext: CodyCommandContext = {
    codebase: false,
}
