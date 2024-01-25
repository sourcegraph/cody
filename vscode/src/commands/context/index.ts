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

        if (config.none) {
            return []
        }

        if (config.selection !== false) {
            const cursor = await getContextFileFromCursor()
            if (cursor) {
                contextFiles.push(cursor)
            }
        }

        if (config.currentFile) {
            const curFile = await getContextFileFromCurrentFile()
            if (curFile) {
                contextFiles.push(curFile)
            }
        }

        if (config.filePath && workspaceRoot?.path) {
            // Create an workspace uri with the given relative file path
            const file = Utils.joinPath(workspaceRoot, config.filePath)
            const filePath = await getContextFileFromUri(file)
            if (filePath) {
                contextFiles.push(filePath)
            }
        }

        if (config.directoryPath && workspaceRoot?.path) {
            // Create an workspace uri with the given relative directory path
            const dir = Utils.joinPath(workspaceRoot, config.directoryPath)
            const dirContext = await getContextFileFromDirectory(dir)
            contextFiles.push(...dirContext)
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
