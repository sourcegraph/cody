import { URI } from 'vscode-uri'

import { IgnoreHelper } from './ignore-helper'

export const ignores = new IgnoreHelper()

/**
 * Checks if a file should be ignored by Cody based on the ignore rules.
 */
export function isCodyIgnoredFile(uri: URI): boolean {
    return ignores.isIgnored(uri)
}
