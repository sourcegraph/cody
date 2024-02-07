const leadingForwardSlashRegex = /^\/+/

export function fromSlashCommand(slashCommand: string): string {
    return slashCommand.replace(leadingForwardSlashRegex, '')
}

/**
 * Returns command starting with a forward slash.
 */
export function toSlashCommand(command: string): string {
    // ensure there is only one leading forward slash
    return command.replace(leadingForwardSlashRegex, '').replace(/^/, '/')
}
