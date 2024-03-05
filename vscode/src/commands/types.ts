import type { ChatEventSource, CodyCommand, ContextItem } from '@sourcegraph/cody-shared'

/**
 * The name of the file for configuring Custom Commands.
 */
export enum ConfigFiles {
    // Cody Commands config file location in VS CODE
    // TODO: Migrate to use the one in /.cody
    VSCODE = '.vscode/cody.json',
    // Cody Commands config file location for all clients
    COMMAND = '.cody/commands.json',
}

/**
 * Creates a CodyCommandArgs object with default values.
 * Generates a random requestID if one is not provided.
 * Merges any provided args with the defaults.
 */
export interface CodyCommandsFile {
    // A set of reusable commands where instructions (prompts) and context can be configured.
    commands: Map<string, CodyCommand>
}

export interface CodyCommandArgs {
    // for tracing the life of the request
    requestID: string
    // where the command was triggered from
    source?: ChatEventSource
    // runs the command in chat mode, even if it's an edit command
    runInChatMode?: boolean
    // current context to add on top of the command context
    userContextFiles?: ContextItem[]
    additionalInstruction?: string
}
