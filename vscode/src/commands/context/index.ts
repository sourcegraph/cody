import * as vscode from 'vscode'

import { isCodyIgnoredFile, type CodyCommandContext, type ContextFile } from '@sourcegraph/cody-shared'

import { logDebug } from '../../log'
import { getContextFileFromCursor } from './selection'
import { getContextFileFromCurrentFile } from './current-file'
import { getContextFileFromUri } from './file-path'
import { getContextFileFromDirectory } from './directory'
import { getContextFileFromTabs } from './open-tabs'
import { Utils } from 'vscode-uri'

/**
 * Gets the context files for a Cody command based on the given configuration.
 *
 * This handles getting context files from the selection, current file,
 * file path, directories, and open tabs based on the `config` object passed in.
 *
 * Context from context.command is added during the initial step in CommandController.
 *
 * The returned context files are filtered to remove any files ignored by Cody.
 */
export const getCommandContextFiles = async (config: CodyCommandContext): Promise<ContextFile[]> => {
    try {
        const contextFiles: ContextFile[] = []
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri

        // Return immediately if context.none is true
        if (config.none) {
            return []
        }

        if (config.selection !== false) {
            contextFiles.push(...(await getContextFileFromCursor()))
        }

        if (config.currentFile) {
            contextFiles.push(...(await getContextFileFromCurrentFile()))
        }

        if (config.filePath && workspaceRoot?.path) {
            // Create an workspace uri with the given relative file path
            const file = Utils.joinPath(workspaceRoot, config.filePath)
            contextFiles.push(...(await getContextFileFromUri(file)))
        }

        if (config.directoryPath && workspaceRoot?.path) {
            // Create an workspace uri with the given relative directory path
            const dir = Utils.joinPath(workspaceRoot, config.directoryPath)
            contextFiles.push(...(await getContextFileFromDirectory(dir)))
        }

        if (config.currentDir) {
            const currentDirContext = await getContextFileFromDirectory()
            contextFiles.push(...currentDirContext)
        }

        if (config.openTabs) {
            contextFiles.push(...(await getContextFileFromTabs()))
        }

        return contextFiles.filter(file => !isCodyIgnoredFile(file.uri))
    } catch (error) {
        logDebug('getCommandContextFiles', 'Error getting command context files', error)
        return []
    }
}
