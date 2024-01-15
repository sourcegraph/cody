import { type URI } from 'vscode-uri'

import { IgnoreHelper } from './ignore-helper'

export const ignores = new IgnoreHelper()

/**
 * Checks if a file should be ignored by Cody based on the ignore rules.
 *
 * Takes URI with file scheme to ensure absolute file paths are ignored correctly across workspaces
 */
export function isCodyIgnoredFile(uri: URI): boolean {
    return ignores.isIgnored(uri)
}
