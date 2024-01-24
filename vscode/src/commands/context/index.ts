import * as vscode from 'vscode'

import type { CodyCommand, ContextFile } from '@sourcegraph/cody-shared'

import { logDebug } from '../../log'
import { getContextFileFromShell } from './get-shell-context'
import { getContextFileFromCursor } from './get-selection-context'
import { getContextFileFromFile } from './get-current-file-context'
import { getContextFileFromUri } from './get-file-context'
import { getContextFileFromDirectory } from './get-directory-context'
import { getContextFileFromTabs } from './get-open-tabs-context'

export const getCommandContextFiles = async (command: CodyCommand): Promise<ContextFile[]> => {
    logDebug('getContextForCommand', 'getting context')
    const contextConfig = command.context || { codebase: false }

    const contextFiles: ContextFile[] = []

    if (contextConfig.none) {
        return []
    }

    if (contextConfig.command) {
        const output = await getContextFileFromShell(contextConfig.command)
        if (output) {
            contextFiles.push(output)
        }
    }

    if (contextConfig.selection !== false) {
        const cursor = await getContextFileFromCursor()
        if (cursor) {
            contextFiles.push(cursor)
        }
    }

    if (contextConfig.currentFile) {
        const curFile = await getContextFileFromFile()
        if (curFile) {
            contextFiles.push(curFile)
        }
    }

    if (contextConfig.filePath) {
        const filePath = await getContextFileFromUri(vscode.Uri.file(contextConfig.filePath))
        if (filePath) {
            contextFiles.push(filePath)
        }
    }

    if (contextConfig.directoryPath) {
        const dir = vscode.Uri.file(contextConfig.directoryPath)
        const dirContext = await getContextFileFromDirectory(dir)
        contextFiles.push(...dirContext)
    }

    if (contextConfig.currentDir) {
        const currentDirContext = await getContextFileFromDirectory()
        contextFiles.push(...currentDirContext)
    }

    if (contextConfig.openTabs) {
        contextFiles.push(...(await getContextFileFromTabs()))
    }

    return contextFiles
}
