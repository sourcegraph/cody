import {
    type ContextItem,
    ContextItemSource,
    TokenCounterUtils,
    displayPath,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { logDebug, logError } from '../../output-channel-logger'
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
        const command = `git diff${hasStagedChanges ? ' --cached' : ''}`

        // A list of file uris to use for comparison with the diff output.
        const diffFiles = hasStagedChanges ? stagedFiles : unstagedFiles

        // Split diff output by files: diff --git a/$FILE b/$FILE\n$DIFF
        const diffOutput = await gitRepo?.diff(hasStagedChanges)
        const diffOutputByFiles = diffOutput.split(/diff --git a\/.+? b\//).filter(Boolean)
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
