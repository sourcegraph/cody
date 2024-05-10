import * as vscode from 'vscode'

import { type ContextItem, ContextItemSource, TokenCounter, displayPath } from '@sourcegraph/cody-shared'
import { logError } from '../../log'
import type { Repository } from '../../repository/builtinGitExtension'
import { doesFileExist } from '../utils/workspace-files'

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
        contextItems.push(getGitCommitTemplateContextFile(template))
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
async function getContextFilesFromGitDiff(gitRepo: Repository): Promise<ContextItem[]> {
    try {
        // We first try to get only staged changed. Otherwise we simply try to get all unstaged changes
        const hasStagedChanges = gitRepo?.state?.indexChanges?.length > 0
        const diffOutput = await gitRepo?.diff(hasStagedChanges)
        if (!diffOutput) {
            throw new Error('Empty git diff output.')
        }

        const command = `git diff${hasStagedChanges ? ' --cached' : ''}`
        const diffs: ContextItem[] = []
        const diffOutputByFiles = diffOutput.trim().split('diff --git ')

        for (const output of diffOutputByFiles) {
            // Use regex match to get the text between 'a/' and ' b/' for the file path.
            const [, uriFromOutput] = output.match(/^a\/(.+?)\s+b\//) || []
            if (!uriFromOutput) {
                continue // Skip this iteration if no file path is found
            }

            // URI enables Cody Ignore checks during prompt-building step.
            const uri = vscode.Uri.joinPath(gitRepo.rootUri, uriFromOutput.trim())

            // Verify the file exists before adding it as context.
            if (!(await doesFileExist(uri))) {
                continue
            }

            const content = diffTemplate
                .replace('{command}', command)
                .replace('<output>', `<output file="${displayPath(uri)}">`)
                .replace('{output}', output.trim())

            diffs.push({
                type: 'file',
                content,
                title: command,
                uri,
                source: ContextItemSource.Terminal,
                size: TokenCounter.countTokens(content),
            })
        }

        // we sort by shortest diffs first so that we include as many changed files as possible
        return diffs.toSorted((a, b) => a.size! - b.size!)
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
                size: TokenCounter.countTokens(content),
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
function getGitCommitTemplateContextFile(template: string): ContextItem {
    const content = `Here is my git commit template:\n\n${template}`
    return {
        type: 'file',
        content,
        title: 'Git Commit Template',
        uri: vscode.Uri.file('COMMIT_TEMPLATE'),
        source: ContextItemSource.Terminal,
        size: TokenCounter.countTokens(content),
    }
}

const diffTemplate = `Here is the '{command}' output:
<output>
{output}
</output>`

const logTemplate = `Here are the titles of the last {maxEntries} commits:
{output}`
