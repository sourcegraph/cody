import { existsSync } from 'fs'
import { formatShortcutAsLabel, getKeybindingsFilePath, parseJsonWithComments } from './utils'
import type { KeybindingsContent } from './type'

let keybindings: KeybindingsContent = null
export const parseCustomKeybindings = (): void => {
    const filePath = getKeybindingsFilePath()
    if (!existsSync(filePath)) {
        keybindings = null
        return
    }
    keybindings = parseJsonWithComments(filePath)
}

export const getCustomKeybindingForCommand = (
    command: string,
    options: { formatAsLabel?: boolean } = {}
): string | undefined => {
    if (keybindings === undefined) {
        throw new Error('Keybindings not initialized. Call parseCustomKeybindings() first.')
    }

    if (keybindings === null) {
        // Was initialized, but file not found.
        return
    }

    const matchingBinding = keybindings.filter(item => item.command && item.command === command)
    if (matchingBinding.length !== 1) {
        // No matching binding, or too many. TODO: What to do if multiple bindings?
        return
    }

    const shortcut = matchingBinding[0].key
    if (options.formatAsLabel) {
        return formatShortcutAsLabel(shortcut)
    }

    return shortcut
}
