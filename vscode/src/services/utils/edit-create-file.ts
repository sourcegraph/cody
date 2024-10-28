import path from 'node:path'
import isEqual from 'lodash/isEqual'
import * as vscode from 'vscode'
import { doesFileExist } from '../../commands/utils/workspace-files'

const separatorsRegex = /[/\\]/g

/**
 * Resolves URI to a workspace or absolute URI, handling various edge cases.
 *
 * If a URI is provided, it checks if the root directory of the URI exists. If it does, the URI is returned as-is.
 * If the root directory does not exist, it attempts to join the URI with the base dir URI.
 * If no URI is provided or no workspace folder is available, it falls back document URI is returned.
 *
 * @param baseDirUri  The base directory URI to use for joining.
 * @param uri The URI to resolve, or `null`/`undefined` to use the active editor's document URI.
 * @param fallbackUri
 * @returns The resolved URI.
 */
export async function resolveRelativeOrAbsoluteUri(
    baseDirUri?: vscode.Uri,
    uri?: string | null,
    fallbackUri?: vscode.Uri
) {
    const isFileProvided = uri && uri?.length > 0
    if (!isFileProvided) {
        return fallbackUri
    }

    const rootDir = vscode.Uri.parse(path.join(...uri.split(separatorsRegex).slice(0, 2)))
    const hasExistingRoot = await doesFileExist(rootDir)
    if (hasExistingRoot) {
        return vscode.Uri.file(uri)
    }

    if (!baseDirUri) {
        return fallbackUri
    }

    return smartJoinPath(baseDirUri, uri)
}

export function smartJoinPath(baseDirUri: vscode.Uri, relativeFileUri: string): vscode.Uri {
    const workspacePath = baseDirUri.path.split(separatorsRegex).filter(segment => segment.length > 0)
    const filePath = relativeFileUri.split(separatorsRegex).filter(segment => segment.length > 0)

    const commonPartLength = filePath.findIndex(segment => segment === workspacePath.at(-1)) + 1
    const hasCommonPart =
        commonPartLength > 0 &&
        isEqual(workspacePath.slice(-commonPartLength), filePath.slice(0, commonPartLength))
    const uniqueFilePath = hasCommonPart ? filePath.slice(commonPartLength) : filePath
    const resultPath = path.join(baseDirUri.path, ...uniqueFilePath)
    return vscode.Uri.file(resultPath)
}
