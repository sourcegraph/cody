import path from 'path'
import * as vscode from 'vscode'
import { parse } from 'comment-json'
import { readFileSync } from 'fs'

import type { KeybindingsContent } from './type'

/* https://code.visualstudio.com/docs/getstarted/keybindings#_advanced-customization */
export const KEYBINDINGS_FILE = 'keybindings.json'

/**
 * Mapping of VS Code product names to their release name used in the path.
 * Used to construct the full path to the keybindings file on each platform.
 */
export const VSCODE_RELEASE_NAME_IN_PATH: Record<string, string> = {
    VSCodium: 'VSCodium',
    'Visual Studio Code - Insiders': 'Code - Insiders',
    'Visual Studio Code': 'Code',
} as const

/**
 * Gets the file path for the keybindings.json file containing
 * custom keybindings based on the current VS Code release.
 */
export const getKeybindingsFilePath = (): string => {
    /*
     * Handle portable mode differently - path is provided via the environment
     * https://code.visualstudio.com/docs/editor/portable
     */
    if (process.env.VSCODE_PORTABLE) {
        return path.join(process.env.VSCODE_PORTABLE, 'user-data', 'User')
    }

    // The actual path to keybindings.json will differ depending on the VS Code release (e.g. insiders)
    const releasePath = VSCODE_RELEASE_NAME_IN_PATH[vscode.env.appName]
    if (!releasePath) {
        throw new Error('Unable to find path to keybindings.json - Unknown release path')
    }

    switch (process.platform) {
        case 'win32':
            return path.join(process.env.APPDATA!, releasePath, 'User', KEYBINDINGS_FILE)
        case 'linux':
            return path.join(process.env.HOME!, '.config', releasePath, 'User', KEYBINDINGS_FILE)
        case 'darwin':
            return path.join(
                process.env.HOME!,
                'Library',
                'Application Support',
                releasePath,
                'User',
                KEYBINDINGS_FILE
            )
        default:
            throw new Error('Unable to find path to keybindings.json - Unknown platform')
    }
}

export function parseJsonWithComments(path: string): KeybindingsContent {
    const content = readFileSync(path).toString()
    const obj = parse(content.toString())
    return obj as KeybindingsContent
}

export const formatShortcutAsLabel = (shortcut: string) => {
    return shortcut
        .split('+')
        .map(key => key.charAt(0).toUpperCase() + key.slice(1))
        .join('+')
}
