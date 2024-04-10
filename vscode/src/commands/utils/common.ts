import type { PromptString } from '@sourcegraph/cody-shared'

const leadingForwardSlashRegex = /^\/+/

/**
 * Removes leading forward slashes from slash command string.
 */
export function fromSlashCommand(slashCommand: PromptString): PromptString {
    return slashCommand.replace(leadingForwardSlashRegex, ps``)
}
