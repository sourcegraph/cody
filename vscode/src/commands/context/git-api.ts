import {
    type ContextItem,
    ContextItemSource,
    TokenCounterUtils,
    displayPath,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { logError } from '../../output-channel-logger'
import type { Repository } from '../../repository/builtinGitExtension'
import { doesFileExist } from '../utils/workspace-files'

import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

/**
 * Get untracked and unstaged files from a git repository.
 *
 * @param gitRepo - The git repository object.
 * @returns A promise that resolves to an array of file objects representing untracked, unstaged files.
 * @throws If there is an error retrieving the untracked files.
 */
export async function getUntrackedUnstagedFiles(gitRepo: Repository): Promise<{ uri: vscode.Uri }[]> {
    try {
        const rootPath = gitRepo.rootUri.fsPath

        const { stdout } = await execAsync('git ls-files --others --exclude-standard', {
            cwd: rootPath,
        })

        if (!stdout.trim()) {
            return []
        }

        const untrackedFiles = stdout
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(filePath => {
                const fileUri = vscode.Uri.joinPath(gitRepo.rootUri, filePath.trim())
                return { uri: fileUri }
            })

        return untrackedFiles
    } catch (error) {
        logError('getUntrackedUnstagedFiles', 'failed', { verbose: error })
        // Return empty array instead of throwing to maintain graceful handling
        return []
    }
}

/**
 * Get the diff content for all unstaged files (both tracked and untracked).
 *
 * @param gitRepo - The git repository object.
 * @returns A promise that resolves to a string containing the diff content.
 * @throws If there is an error retrieving the diff content.
 */
export async function getAllUnstagedFileChanges(gitRepo: Repository): Promise<string> {
    try {
        const rootPath = gitRepo.rootUri.fsPath

        // Get diff for tracked unstaged files
        const trackedUnstagedDiff = await gitRepo.diff(false) // false means unstaged changes

        // Get all untracked unstaged files
        const untrackedUnstagedFiles = await getUntrackedUnstagedFiles(gitRepo)

        if (untrackedUnstagedFiles.length === 0) {
            return trackedUnstagedDiff // If no untracked files, just return tracked changes
        }

        // Get diff for untracked files by comparing them with /dev/null
        const untrackedDiffs = await Promise.all(
            untrackedUnstagedFiles.map(async file => {
                try {
                    // Get paths relative to the git repository root
                    const absoluteFilePath = file.uri.fsPath
                    const repoRootUri = gitRepo.rootUri
                    const absoluteRepoPath = repoRootUri.fsPath

                    const path = require('path')
                    const relativePath = path.relative(absoluteRepoPath, absoluteFilePath)

                    // Use git diff command with /dev/null to show full file content as added
                    const { stdout } = await execAsync(
                        `git diff --no-index -- /dev/null "${relativePath}"`,
                        {
                            cwd: rootPath,
                        }
                    )
                    return stdout.trim()
                } catch (error) {
                    // Git exits with code 1 if files differ, which throws an error in exec
                    // We need to extract the stdout from the error
                    if (error instanceof Error && 'stdout' in error) {
                        const stdout = (error as any).stdout as string
                        return stdout.trim()
                    }
                    throw error
                }
            })
        )

        // Filter out empty diffs and combine all diffs
        const allDiffs = [trackedUnstagedDiff, ...untrackedDiffs.filter(diff => diff.trim().length > 0)]
        return allDiffs.join('\n')
    } catch (error) {
        logError('getAllUnstagedFileChanges', 'failed', { verbose: error })
        throw new Error('Failed to get all unstaged file changes.')
    }
}

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
    const [diffContext, logContext] = await Promise.all([
        getContextFilesFromGitDiff(gitRepo),
        getContextFilesFromGitLog(gitRepo),
    ])

    const contextItems = [...diffContext, ...logContext]
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
        // Get the list of files that currently have staged and tracked unstaged changes.
        const [stagedFiles, trackedUnstagedFiles] = await Promise.all([
            gitRepo.diffIndexWithHEAD(),
            gitRepo.diffWithHEAD(),
        ])

        const untrackedUnstagedFiles = await getUntrackedUnstagedFiles(gitRepo)
        const unstagedFiles = [...trackedUnstagedFiles, ...untrackedUnstagedFiles]
        // Get the diff output for staged changes if there is any,
        // otherwise, get the diff output for unstaged changes.
        const hasStagedChanges = Boolean(stagedFiles?.length)
        let command = undefined
        if (hasStagedChanges) {
            command = 'git diff --cached'
        } else {
            command = 'git diff'
        }

        // A list of file uris to use for comparison with the diff output.
        const diffFiles = hasStagedChanges ? stagedFiles : unstagedFiles

        // Split diff output by files: diff --git a/$FILE b/$FILE\n$DIFF
        let diffOutput = undefined
        if (hasStagedChanges) {
            diffOutput = await gitRepo?.diff(true)
        } else {
            diffOutput = await getAllUnstagedFileChanges(gitRepo)
        }
        const diffOutputSplit = diffOutput.trim().split(/diff --git a\/.+? b\//)
        const diffOutputByFiles = diffOutputSplit.filter(Boolean)
        // Compare the diff files to the diff output to ensure they match,
        // if the numbers are different, we can't trust the diff output were split correctly.
        if (!diffFiles.length || !diffOutput || diffOutputByFiles.length !== diffFiles.length) {
            throw new Error('Empty git diff output.')
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
            if (!matchingFile || !(await doesFileExist(matchingFile.uri))) {
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
        logError('getContextFileFromGitDiff', 'failed', { verbose: error })
        throw new Error('Failed to get git diff.')
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
    try {
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
    } catch (error) {
        logError('getContextFileFromGitLog', 'failed', { verbose: error })
        throw new Error('Failed to get git log.')
    }
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
