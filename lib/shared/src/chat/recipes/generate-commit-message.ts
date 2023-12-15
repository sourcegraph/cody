import { readFile } from 'fs/promises'
import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'path'

import { MAX_AVAILABLE_PROMPT_LENGTH } from '../../prompt/constants'
import { truncateText } from '../../prompt/truncation'
import { newInteraction } from '../prompts/utils'
import { Interaction } from '../transcript/interaction'

import { Recipe, RecipeContext, RecipeID } from './recipe'

const execFile = promisify(_execFile)

export class CommitMessage implements Recipe {
    // If you pass in a context file with this name it will use those changes to generate a commit message for.
    // If such a message doesn't exist it will use local git commands to fetch the staged changes.

    public id: RecipeID = 'commit-message'
    public title = 'Generate Commit Message'

    public async getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null> {
        const source = this.id
        const rawDisplayText = 'Generating a commit message'

        const humanPrompt = await this.getHumanPrompt(undefined, context)

        if (!humanPrompt) {
            return Promise.resolve(null)
        }

        const { prompt, isEmpty, isTruncated } = humanPrompt

        if (isEmpty) {
            const emptyCommitMessage = 'Nothing is staged'
            return newInteraction({
                text: rawDisplayText,
                displayText: rawDisplayText,
                source,
                assistantPrefix: emptyCommitMessage,
                assistantText: emptyCommitMessage,
            })
        }

        const truncatedInputMessage = isTruncated
            ? 'There were more too many changes to process at once, so the commit message may be incomplete.\n\n'
            : ''

        const assistantResponsePrefix = `${truncatedInputMessage}Here is a suggested commit message for the staged changes:\n\n\`\`\``

        return newInteraction({
            text: prompt,
            displayText: rawDisplayText,
            source,
            assistantPrefix: assistantResponsePrefix,
            assistantText: assistantResponsePrefix,
        })
    }

    public async getHumanPrompt(
        diffs: string | undefined,
        context: Pick<RecipeContext, 'editor'>
    ): Promise<
        | { prompt: string; isTruncated: boolean; isEmpty?: undefined }
        | { prompt?: undefined; isTruncated?: undefined; isEmpty: true }
        | null
    > {
        const workspaceUri = context.editor.getWorkspaceRootUri()
        if (!workspaceUri) {
            return null
        }

        const diffContent = diffs ?? (await this.getDiff(workspaceUri.fsPath))

        if (!diffContent) {
            return { isEmpty: true }
        }

        const templateContent = (await this.getCommitTemplate(workspaceUri.fsPath)) || DEFAULT_TEMPLATE_CONTENT

        const promptSuffix = PROMPT_SUFFIX(templateContent)
        // we add the ****'s so that we can trim them off later
        // and keep the total length under the max
        const templatePrompt = '*'.repeat(promptSuffix.length) + PROMPT_PREFIX(diffContent)
        const truncatedPromptPrefix = truncateText(templatePrompt, MAX_AVAILABLE_PROMPT_LENGTH).replace(/'^\**'/, '')

        return {
            prompt: truncatedPromptPrefix + promptSuffix,
            isTruncated: promptSuffix.length + truncatedPromptPrefix.length < templatePrompt.length,
        }
    }

    private async getDiff(cwd: string): Promise<string | null> {
        const { stdout } = await execFile(
            'git',
            ['diff', '--patch', '--unified=1', '--diff-algorithm=minimal', '--no-color', '-M', '-C', '--staged'],
            { cwd }
        )

        const diff = stdout.trim()
        return diff.length > 0 ? diff : null
    }

    private async getCommitTemplate(cwd: string): Promise<string | null> {
        // TODO: Look at other common templates for defining commit messages.
        const templateFormatArgs = ['.gitmessage', '.gitmessage.txt', '.gitmessage.md', '.github/.gitmessage']
        const { stdout } = await execFile('git', ['ls-files', ...templateFormatArgs], {
            cwd,
        })

        if (stdout.trim().length === 0) {
            return null
        }

        const templatePath = path.join(cwd, stdout)
        try {
            return (await readFile(templatePath)).toString()
        } catch {
            // todo: debug logging
            return null
        }
    }
}

const PROMPT_PREFIX = (diff: string): string =>
    `
Here is a set of staged changes:

<staged-changes>
${diff}
`.trim()

const PROMPT_SUFFIX = (template: string): string =>
    `
</staged-changes>

A commit message consists of a short subject line and a body with additional details about and reasons for the change. Commit messages are concise, technical, and specific to the change.

Here is a template that describes in detail how to construct a commit message:

<template>
${template}
</template>

Write a commit message for the staged changes using the template as a guide where applicable.
`.trim()

const DEFAULT_TEMPLATE_CONTENT = `
\`
{type}: {subject}

{description?}

{related-issues?}
\`

--------------------

Type can be
    feat     (new feature)
    fix      (bug fix)
    refactor (refactoring production code)
    style    (formatting, missing semi colons, etc; no code change)
    docs     (changes to documentation)
    test     (adding or refactoring tests; no production code change)
    chore    (updating grunt tasks etc; no production code change)
    wip      (work in progress commit to be squashed -- do not push!)**
--------------------
Remember to
    - Capitalize the subject line
    - Limit the subject line to 50 characters
    - The optional description describes in high level or bullet points how the commit addresses the issue
    - Optionally reference any relevant tickets or issues
    - Limit each line to 72 characters
    - Use the imperative mood in the subject line
    - Do not end the subject line with a period
    - Separate subject from body with a blank line
    - Use the body to explain what and why vs. how
    - Can use multiple lines with "-" for bullet points in body.
--------------------
        `.trim()
