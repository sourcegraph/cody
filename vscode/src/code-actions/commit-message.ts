import * as vscode from 'vscode'
import { execFile as _execFile } from 'node:child_process'
import parseDiff from 'parse-diff'

import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'
import {
    BotResponseMultiplexer,
    type ChatClient,
    type Editor,
    isCodyIgnoredFile,
    isRateLimitError,
    truncateText,
} from '@sourcegraph/cody-shared'
import { promisify } from 'util'
import path from 'node:path'
import { MAX_AVAILABLE_PROMPT_LENGTH } from '@sourcegraph/cody-shared/src/prompt/constants'
import { readFile } from 'node:fs/promises'

const execFile = promisify(_execFile)

const COMMIT_MESSAGE_TOPIC = 'commit-message'
//Used to split a full diff into individual file diffs
const DIFF_SPLIT_REGEX = /(^diff --git)/gm

interface CommitMessageCodeActionOptions {
    chatClient: ChatClient
    editor: Editor
}

export class CommitMessageCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.RefactorRewrite]

    constructor(private options: CommitMessageCodeActionOptions) {
        vscode.commands.registerCommand(
            'cody.command.generate-commit-message',
            async (document: vscode.TextDocument) => {
                telemetryService.log('CodyVSCodeExtension:command:generateCommitMessage:started', {
                    hasV2Event: true,
                })
                telemetryRecorder.recordEvent('cody.command.generateCommitMessage', 'started')

                const commitMessage = await this.provideCommitMessage()
                if (!commitMessage || commitMessage.length === 0) {
                    telemetryService.log('CodyVSCodeExtension:command:generateCommitMessage:empty', {
                        hasV2Event: true,
                    })
                    telemetryRecorder.recordEvent('cody.command.generateCommitMessage', 'empty')
                    return
                }

                // Insert the generated text into the SCM editor
                const commitEdit = new vscode.WorkspaceEdit()
                commitEdit.insert(document.uri, new vscode.Position(0, 0), commitMessage)
                return vscode.workspace.applyEdit(commitEdit)
            }
        )
    }

    public provideCodeActions(document: vscode.TextDocument): vscode.CodeAction[] {
        if (document.uri.scheme !== 'vscode-scm') {
            // Not in the commit message input, do nothing
            return []
        }

        return [this.createCommitMessageCodeAction(document)]
    }

    private createCommitMessageCodeAction(document: vscode.TextDocument): vscode.CodeAction {
        const displayText = 'Ask Cody to Generate a Commit Message'
        const action = new vscode.CodeAction(displayText, vscode.CodeActionKind.RefactorRewrite)
        action.command = {
            command: 'cody.command.generate-commit-message',
            arguments: [document],
            title: displayText,
        }
        return action
    }

    private async provideCommitMessage(): Promise<string | undefined> {
        const humanPrompt = await this.getHumanPrompt()
        if (!humanPrompt) {
            return Promise.reject()
        }

        const { isEmpty, prompt, isTruncated } = humanPrompt
        if (isEmpty) {
            return
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
        const preamble = `Here is a suggested commit message for the diff:\n\n<${COMMIT_MESSAGE_TOPIC}>`
        multiplexer.publish(preamble)

        telemetryService.log('CodyVSCodeExtension:command:generateCommitMessage:executed', {
            hasV2Event: true,
        })
        telemetryRecorder.recordEvent('cody.command.generateCommitMessage', 'executed')
        try {
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
                }
            )
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

        return completion.trim()
    }

    private async getHumanPrompt(): Promise<{
        prompt: string
        isTruncated: boolean
        isEmpty: boolean
    } | null> {
        const workspaceUri = this.options.editor.getWorkspaceRootUri()
        //TODO: we need to discover the git root path for the workspace because it might be further up the tree
        //For instance if you debug this application it opens the `vscode` workspace and suddenly everything breaks
        //But I can't see a good way to do so and it affects more than just the diff. Also doesn't seem to fetch
        //.cody files from the root of the git repo when in a sub-workspace.
        //If you look at the git plugin they run git root discovery for the workspace. We probably want a similar helper.
        if (!workspaceUri) {
            return null
        }
        const diffs = await this.getDiffFromGitCli(workspaceUri.fsPath)

        if (diffs.length === 0) {
            return { isEmpty: true, isTruncated: false, prompt: '' }
        }

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
