import type { URI } from 'vscode-uri'

import { IgnoreHelper } from './ignore-helper'

export const ignores = new IgnoreHelper()

/**
 * Checks if a local file should be ignored by Cody based on the ignore rules.
 *
 * Takes URI with file scheme to ensure absolute file paths are ignored correctly across workspaces
 *
 * 🚨 SECURITY: Each Cody service is responsible for ensuring context from cody ignored files are removed from all LLM requests.
 * See ./ignore-helper.ts for more details.
 */
export function isCodyIgnoredFile(uri: URI): boolean {
    return ignores.isIgnored(uri)
}
