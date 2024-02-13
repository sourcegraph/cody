import { readFile } from 'fs/promises'
import { execFile as _execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import * as vscode from 'vscode'
import parseDiff from 'parse-diff'

import { isCodyIgnoredFile, isRateLimitError } from '@sourcegraph/cody-shared'
import { BotResponseMultiplexer } from '@sourcegraph/cody-shared/src/chat/bot-response-multiplexer'
import type { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import type { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import type { Editor } from '@sourcegraph/cody-shared/src/editor'
import { MAX_AVAILABLE_PROMPT_LENGTH } from '@sourcegraph/cody-shared/src/prompt/constants'
import { truncateText } from '@sourcegraph/cody-shared/src/prompt/truncation'
import type {
    Repository,
    API as ScmAPI,
    CommitMessageProvider as VSCodeCommitMessageProvider,
} from '../repository/builtinGitExtension'
import { telemetryRecorder } from '../services/telemetry-v2'
import { telemetryService } from '../services/telemetry'

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
//Used to split a full diff into individual file diffs
const DIFF_SPLIT_REGEX = /(^diff --git)/gm

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
        telemetryService.log('CodyVSCodeExtension:command:generateCommitMessage:clicked', {
            hasV2Event: true,
        })
        telemetryRecorder.recordEvent('cody.command.generateCommitMessage', 'clicked')

        // Filter out any empty changes.
        // The Git extension seems to provide empty strings for unstaged changes.
        const diffs = changes.filter(diff => diff.trim().length > 0)

        const humanPrompt = await this.getHumanPrompt(diffs)
        if (!humanPrompt) {
            return Promise.reject()
        }

        const { isEmpty, prompt, isTruncated } = humanPrompt
        if (isEmpty) {
            telemetryService.log('CodyVSCodeExtension:command:generateCommitMessage:empty', {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.command.generateCommitMessage', 'empty')
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

        telemetryService.log('CodyVSCodeExtension:command:generateCommitMessage:executed', {
            hasV2Event: true,
        })
        telemetryRecorder.recordEvent('cody.command.generateCommitMessage', 'executed')
        try {
            const abortController = new AbortController()
            const stream = this.options.chatClient.chat(
                [
                    { speaker: 'human', text: prompt },
                    {
                        speaker: 'assistant',
                        text: preamble,
                    },
                ],
                {
                    fast: true,
                    stopSequences: [`</${COMMIT_MESSAGE_TOPIC}>`],
                },
                abortController.signal
            )
            cancellationToken?.onCancellationRequested(abortController.abort)
            for await (const message of stream) {
                switch (message.type) {
                    case 'change':
                        void multiplexer.publish(message.text)
                        break
                    case 'error':
                        throw message.error
                    case 'complete':
                        void multiplexer.notifyTurnComplete()
                        break
                }
            }
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

    private async getDiffFromGitCli(cwd: string): Promise<string[]> {
        const diffCliCommands = [
            'diff',
            '--patch',
            '--unified=1',
            '--diff-algorithm=minimal',
            '--no-color',
            '-M',
            '-C',
        ]
        let diff: string

        // First, attempt to get a diff from only staged changes
        diff = (await execFile('git', [...diffCliCommands, '--staged'], { cwd })).stdout.trim()

        if (!diff) {
            // Attempt to get a diff from all changes, not just staged.
            diff = (await execFile('git', [...diffCliCommands, 'HEAD'], { cwd })).stdout.trim()
        }

        // we now split the diff per file to match what VSCode would have given us
        const diffParts = diff.split(DIFF_SPLIT_REGEX)
        while (diffParts.length > 0 && diffParts[0] === '') {
            diffParts.shift()
        }
        const chunks = diffParts.reduce((acc, part, idx) => {
            if (idx % 2 === 0) {
                // delimiter
                acc.push(part)
            } else {
                acc[acc.length - 1] += part
            }
            return acc
        }, [] as string[])

        return chunks
    }

    public async getHumanPrompt(
        diffs: string[] | undefined
    ): Promise<{ prompt: string; isTruncated: boolean; isEmpty: boolean } | null> {
        const workspaceUri = this.options.editor.getWorkspaceRootUri()
        //TODO: we need to discover the git root path for the workspace because it might be further up the tree
        //For instance if you debug this application it opens the `vscode` workspace and suddenly everything breaks
        //But I can't see a good way to do so and it affects more than just the diff. Also doesn't seem to fetch
        //.cody files from the root of the git repo when in a sub-workspace.
        //If you look at the git plugin they run git root discovery for the workspace. We probably want a similar helper.
        if (!workspaceUri) {
            return null
        }

        if (!diffs?.length) {
            console.log('Getting from cli')
            diffs = await this.getDiffFromGitCli(workspaceUri.fsPath)
        }

        if (diffs.length === 0) {
            console.log('No diffs, even from the cli')
            return { isEmpty: true, isTruncated: false, prompt: '' }
        }

        console.log('Got diffs', diffs)

        const allowedDiffs = diffs.filter(diff => {
            const files = parseDiff(diff)
            const affectedFileUris = files
                .filter(file => file.to)
                .map(file => vscode.Uri.file(path.join(workspaceUri.fsPath, file.to!)))
            if (affectedFileUris.some(isCodyIgnoredFile)) {
                return false
            }
            return true
        })

        const diffContent = allowedDiffs.join('\n').trim()
        if (!diffContent) {
            return { isEmpty: true, isTruncated: false, prompt: '' }
        }

        const templateContent =
            (await this.getCommitTemplate(workspaceUri!.fsPath)) || DEFAULT_TEMPLATE_CONTENT //somehow tsc screws up here?!?
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
        for (const disposable of this.disposables) {
            disposable.dispose()
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
