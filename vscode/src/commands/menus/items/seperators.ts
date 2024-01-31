import type { CommandMenuItem } from '../types'

// Seperators
const commandsSeparator: CommandMenuItem = { kind: -1, label: 'commands' }
const customSeparator: CommandMenuItem = { kind: -1, label: 'custom commands (beta)' }
const settingsSeparator: CommandMenuItem = { kind: -1, label: 'settings' }
const lastUsedSeparator: CommandMenuItem = { kind: -1, label: 'last used' }

export const CommandMenuSeperator = {
    commands: commandsSeparator,
    custom: customSeparator,
    settings: settingsSeparator,
    lastUsed: lastUsedSeparator,
}
