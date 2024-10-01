import { type ContextItem, wrapInActiveSpan } from '@sourcegraph/cody-shared'

import type * as vscode from 'vscode'

import { getSearchPatternForTestFiles } from '../utils/search-pattern'
import { isValidTestFile } from '../utils/test-commands'
import { getContextFileFromDirectory } from './directory'
import { getWorkspaceFilesContext } from './workspace'

/**
 * Gets context files related to the given test file.
 *
 * Searches for test files in the current directory first.
 * If none found, searches the entire workspace for test files.
 *
 * Returns only valid test files up to the max limit.
 *
 * NOTE: This is used by the current unit test commands to get context files.
 * NOTE: Will be replaced by the new unit test commands once it's ready.
 */
export async function getContextFilesForTestCommand(file: vscode.Uri): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.testChat', async span => {
        const contextFiles: ContextItem[] = []

        // exclude any files in the path with e2e, integration, node_modules, or dist
        const excludePattern = '**/*{e2e,integration,node_modules,dist}*/**'
        // To search for files in the current directory only
        const searchInCurrentDirectoryOnly = true
        // The max number of files to search for in each workspace search
        const max = 5

        // Get context from test files in current directory
        contextFiles.push(...(await getContextFileFromDirectory()))

        if (!contextFiles.length) {
            const wsTestPattern = getSearchPatternForTestFiles(file, !searchInCurrentDirectoryOnly)
            const codebaseFiles = await getWorkspaceFilesContext(wsTestPattern, excludePattern, max)

            contextFiles.push(...codebaseFiles)
        }

        // Return valid test files only
        return contextFiles.filter(f => isValidTestFile(f.uri))
    })
}
