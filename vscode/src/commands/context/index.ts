import * as vscode from 'vscode'

import type { CodyCommandContext, ContextFile } from '@sourcegraph/cody-shared'

import { logDebug } from '../../log'
import { getContextFileFromCursor } from './get-selection-context'
import { getContextFileFromFile } from './get-current-file-context'
import { getContextFileFromUri } from './get-file-context'
import { getContextFileFromDirectory } from './get-directory-context'
import { getContextFileFromTabs } from './get-open-tabs-context'

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
            const curFile = await getContextFileFromFile()
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

        return contextFiles
    } catch (error) {
        logDebug('getCommandContextFiles', 'Error getting command context files', error)

        return []
    }
}
