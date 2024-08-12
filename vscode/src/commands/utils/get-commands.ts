import * as uuid from 'uuid'

import type { CodyCommand } from '@sourcegraph/cody-shared'

import type { CodyCommandType } from '@sourcegraph/cody-shared'
import type { CodyCommandArgs } from '../types'

/**
 * Builds a map of CodyCommands with content from a JSON file.
 * @param type The type of commands being built.
 * @param fileContent The contents of the cody.json file.
 */
export function buildCodyCommandMap(
    type: CodyCommandType,
    fileContent: string
): Map<string, CodyCommand> {
    const map = new Map<string, CodyCommand>()
    const parsed = JSON.parse(fileContent) as Record<string, any>
    // Check if parsed has a "commands" key and use that as the root
    // If it doesn't, use the root as the root
    const commands = parsed.commands ?? parsed
    for (const key in commands) {
        const command = commands[key] satisfies Partial<CodyCommand>
        // Skip adding the command if it doesn't have a prompt
        if (!command.prompt) {
            continue
        }
        command.type = type
        // NOTE: we no longer support slash commands, this is for backward compatibility
        command.key = key
        // Set default mode to ask unless it's an edit command
        command.mode = command.mode ?? 'ask'
        map.set(command.key, command satisfies CodyCommand)
    }

    return map
}

/**
 * Creates a CodyCommandArgs object with default values.
 * Generates a random requestID if one is not provided.
 * Merges any provided args with the defaults.
 */
export function newCodyCommandArgs(args: Partial<CodyCommandArgs> = {}): CodyCommandArgs {
    return {
        requestID: args.requestID ?? uuid.v4(),
        ...args,
    }
}
