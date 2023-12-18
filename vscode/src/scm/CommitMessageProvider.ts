import { readFile } from 'fs/promises'
import { execFile as _execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import * as vscode from 'vscode'

import { isRateLimitError } from '@sourcegraph/cody-shared/dist/sourcegraph-api/errors'
import { BotResponseMultiplexer } from '@sourcegraph/cody-shared/src/chat/bot-response-multiplexer'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { MAX_AVAILABLE_PROMPT_LENGTH } from '@sourcegraph/cody-shared/src/prompt/constants'
import { truncateText } from '@sourcegraph/cody-shared/src/prompt/truncation'

import type {
    Repository,
    API as ScmAPI,
    CommitMessageProvider as VSCodeCommitMessageProvider,
} from '../repository/builtinGitExtension'

const execFile = promisify(_execFile)

export interface CommitMessageProviderOptions {
    chatClient: ChatClient
    editor: Editor
    gitApi: ScmAPI
}

export interface CommitMessageGuide {
    template?: string
}

const COMMIT_MESSAGE_TOPIC = 'commit-message'

export class CommitMessageProvider implements VSCodeCommitMessageProvider, vscode.Disposable {
    public icon = new vscode.ThemeIcon('cody-logo')
    public title = 'Generate Commit Message (Cody)'

    private disposables: vscode.Disposable[] = []
    private _subscription?: vscode.Disposable

    constructor(private readonly options: CommitMessageProviderOptions) {}

    public onConfigurationChange(config: ConfigurationWithAccessToken): void {
        if (config.experimentalCommitMessage) {
            this._subscription = this.options.gitApi.registerCommitMessageProvider?.(this)
        } else {
            this._subscription?.dispose()
            this._subscription = undefined
        }
    }

    public async provideCommitMessage(
        repository: Repository,
        changes: string[],
        cancellationToken?: vscode.CancellationToken
    ): Promise<string | undefined> {
        // we ignore the changes coming form VSCode here as the resulting commit messages were just not as good
        // it could maybe be something to fall back on for web, but the recipe doesn't work for that atm. anyways.
        const humanPrompt = await this.getHumanPrompt(changes)
        if (!humanPrompt) {
            return Promise.reject()
        }

        const { isEmpty, prompt, isTruncated } = humanPrompt
        if (isEmpty) {
            return repository.inputBox.value
        }

        if (isTruncated) {
            this.options.editor.showWarningMessage(
                'The length of the diff exceeded the maximum available length. Using a truncated diff.'
            )
        }

        let completion = ''
        const multiplexer = new BotResponseMultiplexer()
        multiplexer.sub(COMMIT_MESSAGE_TOPIC, {
            onResponse: (content: string) => {
                completion = content
                return Promise.resolve()
            },
            onTurnComplete: () => {
                return Promise.resolve()
            },
        })

        // Prefix the assistant response with any prewritten human text
        const prefix = repository.inputBox.value
        const preamble = `Here is a suggested commit message for the diff:\n\n<${COMMIT_MESSAGE_TOPIC}>${prefix}`
        multiplexer.publish(preamble)

        try {
            await new Promise<void>((resolve, reject) => {
                const abort = this.options.chatClient.chat(
                    [
                        { speaker: 'human', text: prompt },
                        {
                            speaker: 'assistant',
                            text: preamble,
                        },
                    ],
                    {
                        onChange: text => {
                            void multiplexer.publish(text)
                        },
                        onComplete: () => {
                            void multiplexer.notifyTurnComplete()
                            resolve()
                        },
                        onError: error => {
                            reject(error)
                        },
                    },
                    {
                        fast: true,
                        stopSequences: [`</${COMMIT_MESSAGE_TOPIC}>`],
                    }
                )

                cancellationToken?.onCancellationRequested(abort)
            })
        } catch (error) {
            if (isRateLimitError(error)) {
                vscode.commands.executeCommand(
                    'cody.show-rate-limit-modal',
                    error.userMessage,
                    error.retryMessage,
                    error.upgradeIsAvailable
                )
            }
            return Promise.reject(error)
        }

        const fullText = prefix + completion
        return fullText.trim()
    }

    private async getDiffFromGitCli(cwd: string): Promise<string | null> {
        const diffCliCommands = ['diff', '--patch', '--unified=1', '--diff-algorithm=minimal', '--no-color', '-M', '-C']
        let diff: string

        // First, attempt to get a diff from only staged changes
        diff = (await execFile('git', [...diffCliCommands, '--staged'], { cwd })).stdout.trim()

        if (!diff) {
            // Attempt to get a diff from all changes, not just staged.
            diff = (await execFile('git', [...diffCliCommands, 'HEAD'], { cwd })).stdout.trim()
        }

        return diff.length > 0 ? diff : null
    }

    public async getHumanPrompt(
        diffs: string[] | undefined
    ): Promise<{ prompt: string; isTruncated: boolean; isEmpty: boolean } | null> {
        const workspaceUri = this.options.editor.getWorkspaceRootUri()
        if (!workspaceUri) {
            return null
        }

        const diffContent =
            diffs && diffs.length > 0 ? diffs.join('\n') : await this.getDiffFromGitCli(workspaceUri.fsPath)
        if (!diffContent) {
            return { isEmpty: true, isTruncated: false, prompt: '' }
        }

        const templateContent = (await this.getCommitTemplate(workspaceUri.fsPath)) || DEFAULT_TEMPLATE_CONTENT
        const fullPrompt = PROMPT_PREFIX(diffContent) + PROMPT_SUFFIX(templateContent)
        const prompt = truncateText(fullPrompt, MAX_AVAILABLE_PROMPT_LENGTH)

        return {
            prompt,
            isTruncated: prompt.length < fullPrompt.length,
            isEmpty: false,
        }
    }

    private async getCommitTemplate(cwd: string): Promise<string | null> {
        try {
            const commitTemplateFile = (
                await execFile('git', ['config', '--get', 'commit.template'], {
                    cwd,
                })
            ).stdout.trim()

            if (commitTemplateFile.length === 0) {
                return null
            }

            const templatePath = path.join(cwd, commitTemplateFile)
            return (await readFile(templatePath)).toString()
        } catch (error) {
            console.warn('Unable to get commit template', error)
            return null
        }
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose())
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
