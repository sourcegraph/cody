const leadingForwardSlashRegex = /^\/+/

/**
 * Removes leading forward slashes from slash command string.
 */
export function fromSlashCommandPrompt(slashCommand: string): string {
    return slashCommand.replace(leadingForwardSlashRegex, '')
}
