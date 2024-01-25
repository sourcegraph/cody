import * as vscode from 'vscode'

import { isCodyIgnoredFile, type CodyCommandContext, type ContextFile } from '@sourcegraph/cody-shared'

import { logDebug } from '../../log'
import { getContextFileFromCursor } from './selection'
import { getContextFileFromCurrentFile } from './current-file'
import { getContextFileFromUri } from './file-path'
import { getContextFileFromDirectory } from './directory'
import { getContextFileFromTabs } from './open-tabs'

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

        if (config.filePath) {
            const filePath = await getContextFileFromUri(vscode.Uri.file(config.filePath))
            if (filePath) {
                contextFiles.push(filePath)
            }
        }

        if (config.directoryPath) {
            const dir = vscode.Uri.file(config.directoryPath)
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
