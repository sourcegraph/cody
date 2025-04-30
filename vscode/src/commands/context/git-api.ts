import * as vscode from 'vscode'

import {
    type ContextItem,
    ContextItemSource,
    TokenCounterUtils,
    displayPath,
} from '@sourcegraph/cody-shared'
import type { Repository } from '../../repository/builtinGitExtension'

/**
 * Generates context files from the git diff and git log of a given repository.
 *
 * @param gitRepo - The git repository object.
 * @param template - An optional template for a git commit context file.
 * @returns A promise that resolves to an array of ContextItem objects representing the git diff and git log.
 * @throws If there is an error retrieving the git diff or git log.
 */
export async function getContextFilesFromGitApi(
    gitRepo: Repository,
    template?: string
): Promise<ContextItem[]> {
    const contextItems = []
    try {
        const diffContext = await getContextFilesFromGitDiff(gitRepo)
        contextItems.push(...diffContext)
    } catch (error) {
        throw new Error("Unable to get context files from git diff", {cause: error})
    }
    try {
        const logContext = await getContextFilesFromGitLog(gitRepo)
        contextItems.push(...logContext)
    } catch (error) {
        throw new Error("Unable to get context files from git log", {cause: error})
    }

    if (template) {
        contextItems.push(await getGitCommitTemplateContextFile(template))
    }
    return contextItems
}

/**
 * Generate context files from the git diff of a given repository.
 *
 * @param gitRepo - The git repository object.
 * @returns A promise that resolves to an array of ContextItem objects representing the git diff.
 * @throws If the git diff output is empty or if there is an error retrieving the git diff.
 */
export async function getContextFilesFromGitDiff(gitRepo: Repository): Promise<ContextItem[]> {
    try {
        // Get the list of files that currently have staged and unstaged changes.
        const [stagedFiles, unstagedFiles] = await Promise.all([
            gitRepo.diffIndexWithHEAD(),
            gitRepo.diffWithHEAD(),
        ])

        // Get the diff output for staged changes if there is any,
        // otherwise, get the diff output for unstaged changes.
        const hasStagedChanges = Boolean(stagedFiles?.length)
        const command = `git diff${hasStagedChanges ? ' --cached' : ''}`

        // A list of file uris to use for comparison with the diff output.
        const diffFiles = hasStagedChanges ? stagedFiles : unstagedFiles

        // Split diff output by files: diff --git a/$FILE b/$FILE\n$DIFF
        const diffOutput = await gitRepo?.diff(hasStagedChanges)
        const diffOutputByFiles = diffOutput.split(/diff --git a\/.+? b\//).filter(Boolean)

        // Compare the diff files to the diff output to ensure they match,
        // if the numbers are different, we can't trust the diff output were split correctly.
        if (diffOutputByFiles.length !== diffFiles.length) {
            throw new Error('Discrepancy in diff output and diff files')
        }

        const diffs: ContextItem[] = []

        for (const diffOutput of diffOutputByFiles) {
            if (!diffOutput) {
                continue // Skip this iteration if no file path is found
            }

            const diffPath = diffOutput.split('\n')[0]
            if (!diffPath) {
                continue
            }

            const normalizePath = (path: string) => path.replace(/\\/g, '/')

            // Verify the file exists before adding it as context.
            // We do this by checking the reverse path because of how nested workspaces might add unknown prefixes.
            const normalizedDiffPath = normalizePath(diffPath) // Example: "vscode/test.txt" - the path from the workspace root
            const matchingFile = diffFiles.find(file => {
                // Example filePath: "/Users/yk/Desktop/cody/vscode/test.txt"
                const filePath = normalizePath(file.uri.path)
                return filePath.endsWith(normalizedDiffPath)
            })

            if (!matchingFile) {
                continue
            }

            const content = diffTemplate
                .replace('{command}', command)
                .replace('<output>', `<output file="${displayPath(matchingFile.uri)}">`)
                .replace('{output}', diffOutput.trim())

            diffs.push({
                type: 'file',
                content,
                title: command,
                // Using the uri by file enables Cody Ignore checks during prompt-building step.
                uri: matchingFile.uri,
                source: ContextItemSource.Terminal,
                size: await TokenCounterUtils.countTokens(content),
            })
        }

        if (diffs.length === 0) {
            throw new Error('Empty git diff output.')
        }

        // we sort by shortest diffs first so that we include as many changed files as possible
        return diffs.sort((a, b) => a.size! - b.size!)
    } catch (error) {
        let errorMessage = "failed"
        if (error instanceof Error && error.message) {
            errorMessage += `: ${error.message}`
        }
        throw new Error('Failed to get git diff.', { cause: error })
    }
}

/**
 * Generate context files from the git log of a given repository.
 *
 * @param gitRepo - The git repository object.
 * @param maxEntries - The maximum number of log entries to retrieve. Default is 5.
 * @returns A promise that resolves to an array of ContextItem objects.
 * @throws If the git log is empty or if there is an error retrieving the git log.
 */
async function getContextFilesFromGitLog(gitRepo: Repository, maxEntries = 5): Promise<ContextItem[]> {
    const logs = await gitRepo.log({ maxEntries })
    if (!logs.length) {
        throw new Error('Empty git log output.')
    }

    const command = `titles of the last ${maxEntries} git log entries`
    const groupedTitles = logs.map(({ message }) => `<title>${message.trim()}</title>`).join('\n')
    const content = logTemplate
        .replace('{maxEntries}', `${maxEntries}`)
        .replace('{output}', groupedTitles)

    return [
        {
            type: 'file',
            content,
            title: command,
            uri: vscode.Uri.file('GIT_LOG'),
            source: ContextItemSource.Terminal,
            size: await TokenCounterUtils.countTokens(content),
        },
    ]
}

/**
 * Generate a context item for a git commit template.
 *
 * @param template - The git commit template.
 * @returns The context item containing the git commit template information.
 */
async function getGitCommitTemplateContextFile(template: string): Promise<ContextItem> {
    const content = `Here is my git commit template:\n\n${template}`
    return {
        type: 'file',
        content,
        title: 'Git Commit Template',
        uri: vscode.Uri.file('COMMIT_TEMPLATE'),
        source: ContextItemSource.Terminal,
        size: await TokenCounterUtils.countTokens(content),
    }
}

const diffTemplate = `Here is the '{command}' output:
<output>
{output}
</output>`

const logTemplate = `Here are the titles of the previous {maxEntries} commits:
{output}`
