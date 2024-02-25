import { type ContextItem, wrapInActiveSpan } from '@sourcegraph/cody-shared'

import type { URI } from 'vscode-uri'
import { getSearchPatternForTestFiles } from '../utils/search-pattern'
import { isTestFileForOriginal, isValidTestFile } from '../utils/test-commands'
import { getContextFileFromDirectory } from './directory'
import { getWorkspaceFilesContext } from './workspace'

export async function getContextFilesForAddingUnitTestCases(testFile: URI): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.testCase', async span => {
        // Get the context from the current directory
        // and then find the original file of the test file in the returned context
        // If the original file is found, return it
        // e.g. if the test file is src/foo/bar.spec.ts, look for src/foo/bar.ts
        const directoryContext = await getContextFileFromDirectory()
        const originalFileContext = directoryContext.find(f => isTestFileForOriginal(f.uri, testFile))
        if (originalFileContext) {
            return [originalFileContext]
        }

        // TODO (bee) improves context search
        const contextFiles: ContextItem[] = []
        // exclude any files in the path with e2e, integration, node_modules, or dist
        const excludePattern = '**/*{e2e,integration,node_modules,dist}*/**'
        // To search for files in the current directory only
        const searchInCurrentDirectoryOnly = true
        // The max number of files to search for in each workspace search
        const max = 10

        // Search for test files in the current directory first
        const curerntDirPattern = getSearchPatternForTestFiles(testFile, searchInCurrentDirectoryOnly)
        const currentDirContext = await getWorkspaceFilesContext(curerntDirPattern, excludePattern, max)

        contextFiles.push(...currentDirContext)

        // If no test files found in the current directory, search the entire workspace
        if (!contextFiles.length) {
            const wsTestPattern = getSearchPatternForTestFiles(testFile, !searchInCurrentDirectoryOnly)
            // Will try to look for half the max number of files in the workspace for faster results
            const codebaseFiles = await getWorkspaceFilesContext(wsTestPattern, excludePattern, max / 2)

            contextFiles.push(...codebaseFiles)
        }

        // Return valid test files only
        return contextFiles.filter(f => isValidTestFile(f.uri))
    })
}
