import { ContextFile } from '../../codebase-context/messages'
import { ChatEventSource } from '../transcript/messages'

import * as defaultPrompts from './cody.json'
import { toSlashCommand } from './utils'

// A list of default cody commands
export type CodyDefaultCommands = 'ask' | 'doc' | 'edit' | 'explain' | 'smell' | 'test' | 'reset'

export const defaultChatCommands = new Set(['explain', 'doc', 'edit', 'smell', 'test', 'ask', 'reset'])

export function getDefaultCommandsMap(editorCommands: CodyPrompt[] = []): Map<string, CodyPrompt> {
    const map = new Map<string, CodyPrompt>()

    // Add editor specifc commands
    for (const command of editorCommands) {
        if (command.slashCommand) {
            map.set(command.slashCommand, command)
        }
    }

    // Add default commands
    const prompts = defaultPrompts.commands as Record<string, unknown>
    for (const key in prompts) {
        if (Object.prototype.hasOwnProperty.call(prompts, key)) {
            const prompt = prompts[key] as CodyPrompt
            prompt.type = 'default'
            prompt.slashCommand = toSlashCommand(key)
            map.set(prompt.slashCommand, prompt)
        }
    }

    return map
}

export function getCommandEventSource(command: CodyPrompt): ChatEventSource {
    if (command?.type === 'default') {
        const commandName = command.slashCommand.replace(/^\//, '')
        if (defaultChatCommands.has(commandName)) {
            return commandName as CodyDefaultCommands
        }
    }
    return 'custom-commands'
}

export interface MyPrompts {
    // A set of reusable commands where instructions (prompts) and context can be configured.
    commands: Map<string, CodyPrompt>
    // backward compatibility
    recipes?: Map<string, CodyPrompt>
}

// JSON format of MyPrompts
export interface MyPromptsJSON {
    commands: { [id: string]: Omit<CodyPrompt, 'slashCommand'> }
    recipes?: { [id: string]: CodyPrompt }
}

// The blueprint of a Cody Command
export interface CodyPrompt {
    requestID?: string
    description?: string
    prompt: string
    context?: CodyPromptContext
    type?: CodyPromptType
    slashCommand: string
    mode?: CodyPromptMode

    // internal properties
    contextFiles?: ContextFile[]
    additionalInput?: string
}

/**
 * - ask mode is the default mode, run prompt in sidebar
 * - edit mode will run prompt with fixup
 * - insert mode is the same as edit, but instead of replacing selection with cody's response,
 * it adds to the top of the selection instead
 */
export type CodyPromptMode = 'ask' | 'edit' | 'insert'

// Type of context available for prompt building
export interface CodyPromptContext {
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

export type CodyPromptType = 'workspace' | 'user' | 'default' | 'recently used'

export type CustomCommandType = 'workspace' | 'user'

export const ConfigFileName = {
    vscode: '.vscode/cody.json',
}

// Default to not include codebase context
export const defaultCodyPromptContext: CodyPromptContext = {
    codebase: false,
}
