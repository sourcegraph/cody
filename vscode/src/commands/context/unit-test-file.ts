import { type ContextItem, wrapInActiveSpan } from '@sourcegraph/cody-shared'

import type { URI } from 'vscode-uri'
import { getSearchPatternForTestFiles } from '../utils/search-pattern'
import { isValidTestFile } from '../utils/test-commands'
import { getWorkspaceFilesContext } from './workspace'

/**
 * Gets context files related to the given test file.
 *
 * Searches for test files in the current directory first.
 * If none found, searches the entire workspace for test files.
 *
 * Returns only valid test files up to the max limit.
 *
 * NOTE: Does not work with Agent as the underlying API is not available in Agent.
 * NOTE: Used by the new unit test commands to get context files.
 */
export async function getContextFilesForUnitTestCommand(file: URI): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.test', async span => {
        const contextFiles: ContextItem[] = []

        // exclude any files in the path with e2e, integration, node_modules, or dist
        const excludePattern = '**/*{e2e,integration,node_modules,dist}*/**'
        // To search for files in the current directory only
        const searchInCurrentDirectoryOnly = true
        // The max number of files to search for in each workspace search
        const max = 10

        // Search for test files in the current directory first
        const curerntDirPattern = getSearchPatternForTestFiles(file, searchInCurrentDirectoryOnly)
        const currentDirContext = await getWorkspaceFilesContext(curerntDirPattern, excludePattern, max)

        contextFiles.push(...currentDirContext)

        // If no test files found in the current directory, search the entire workspace
        if (!contextFiles.length) {
            const wsTestPattern = getSearchPatternForTestFiles(file, !searchInCurrentDirectoryOnly)
            // Will try to look for half the max number of files in the workspace for faster results
            const codebaseFiles = await getWorkspaceFilesContext(wsTestPattern, excludePattern, max / 2)

            contextFiles.push(...codebaseFiles)
        }

        // Return valid test files only
        return contextFiles.filter(f => isValidTestFile(f.uri))
    })
}
