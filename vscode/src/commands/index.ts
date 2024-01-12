import { type CodyCommand } from '@sourcegraph/cody-shared/src/commands'

import * as defaultCommands from './prompt/cody.json'
import { toSlashCommand } from './prompt/utils'

export function getDefaultCommandsMap(editorCommands: CodyCommand[] = []): Map<string, CodyCommand> {
    const map = new Map<string, CodyCommand>()

    // Add editor specifc commands
    for (const command of editorCommands) {
        if (command.slashCommand) {
            map.set(command.slashCommand, command)
        }
    }

    // Add default commands
    const commands = defaultCommands.commands as Record<string, unknown>
    for (const key in commands) {
        if (Object.prototype.hasOwnProperty.call(commands, key)) {
            const command = commands[key] as CodyCommand
            command.type = 'default'
            command.slashCommand = toSlashCommand(key)
            map.set(command.slashCommand, command)
        }
    }

    return map
}

export interface MyPrompts {
    // A set of reusable commands where instructions (prompts) and context can be configured.
    commands: Map<string, CodyCommand>
    // backward compatibility
    recipes?: Map<string, CodyCommand>
}

// JSON format of MyPrompts
export interface MyPromptsJSON {
    commands: { [id: string]: Omit<CodyCommand, 'slashCommand'> }
    recipes?: { [id: string]: CodyCommand }
}

export const ConfigFileName = {
    vscode: '.vscode/cody.json',
}
