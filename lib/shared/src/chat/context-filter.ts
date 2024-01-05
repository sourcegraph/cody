import { URI } from 'vscode-uri'

import { IgnoreHelper } from './ignore-helper'

export const ignores = new IgnoreHelper()

/**
 * Checks if a file should be ignored by Cody based on the ignore rules.
 *
 * Takes URI to ensure absolute file paths are ignored correctly across workspaces
 */
export function isCodyIgnoredFile(uri: URI): boolean {
    return ignores.isIgnored(uri)
}

/**
 * Checks if the relative path of a file should be ignored by Cody based on the ignore rules.
 *
 * Use for matching search results returned from the embeddings client that do not contain absolute path/URI
 * In isIgnoredByCurrentWorkspace, we will construct a URI with the relative path and workspace root before checking
 */
export function isCodyIgnoredFilePath(codebase: string, relativePath: string): boolean {
    return ignores.isIgnoredByCodebase(codebase.trim(), relativePath)
}
