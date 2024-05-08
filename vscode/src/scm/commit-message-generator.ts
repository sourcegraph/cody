import { execFile as _execFile } from 'node:child_process'
import parseDiff from 'parse-diff'
import * as vscode from 'vscode'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import {
    BotResponseMultiplexer,
    type ChatClient,
    type Editor,
    PromptString,
    getDotComDefaultModels,
    isCodyIgnoredFile,
    isRateLimitError,
    telemetryRecorder,
    truncateText,
} from '@sourcegraph/cody-shared'
import { CHAT_INPUT_TOKEN_BUDGET } from '@sourcegraph/cody-shared/src/token/constants'
import { telemetryService } from '../services/telemetry'

const execFile = promisify(_execFile)

const COMMIT_MESSAGE_TOPIC = 'commit-message'
//Used to split a full diff into individual file diffs
const DIFF_SPLIT_REGEX = /(^diff --git)/gm

interface CommitMessageGeneratorOptions {
    chatClient: ChatClient
    editor: Editor
}

export class CommitMessageGenerator implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private initialScmPlaceholder = ''
    private initialScmValue = ''

    constructor(private options: CommitMessageGeneratorOptions) {
        this.disposables.push(
            vscode.commands.registerCommand(
                'cody.command.generate-commit-message',
                async (scm: vscode.SourceControl) => this.provideCommitMessage(scm)
            ),
            vscode.commands.registerCommand(
                'cody.command.generate-commit-message.stop',
                async (scm: vscode.SourceControl) => {
                    scm.inputBox.value = this.initialScmValue
                    scm.inputBox.placeholder = this.initialScmPlaceholder
                    scm.inputBox.enabled = true
                    await vscode.commands.executeCommand(
                        'setContext',
                        'cody.generating-commit-message',
                        false
                    )
                }
            )
        )
    }

    private async provideCommitMessage(scm: vscode.SourceControl): Promise<void> {
        telemetryRecorder.recordEvent('cody.command.generateCommitMessage', 'started')
        await vscode.commands.executeCommand('setContext', 'cody.generating-commit-message', true)

        this.initialScmPlaceholder = scm.inputBox.placeholder
        this.initialScmValue = scm.inputBox.value

        // Update the input box to represent a loading state
        scm.inputBox.value = ''
        scm.inputBox.placeholder = 'Cody is working...'
        scm.inputBox.enabled = false

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
            onTurnComplete: async () => {
                scm.inputBox.value = completion
                scm.inputBox.enabled = true
                scm.inputBox.placeholder = this.initialScmPlaceholder
                await vscode.commands.executeCommand(
                    'setContext',
                    'cody.generating-commit-message',
                    false
                )
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
            const psPrompt = PromptString.unsafe_fromUserQuery(prompt)
            const psPreamble = PromptString.unsafe_fromUserQuery(preamble)
            const model = getDotComDefaultModels().find(model => model.title === 'Claude 3 Haiku')?.model
            const stream = this.options.chatClient.chat(
                [
                    { speaker: 'human', text: psPrompt },
                    {
                        speaker: 'assistant',
                        text: psPreamble,
                    },
                ],
                {
                    model,
                    stopSequences: [`</${COMMIT_MESSAGE_TOPIC}>`],
                    maxTokensToSample: 1000,
                }
            )
            for await (const message of stream) {
                switch (message.type) {
                    case 'change':
                        await multiplexer.publish(message.text)
                        break
                    case 'error':
                        throw message.error
                    case 'complete':
                        await multiplexer.notifyTurnComplete()
                        break
                }
            }
        } catch (error) {
            scm.inputBox.value = this.initialScmValue
            scm.inputBox.placeholder = this.initialScmPlaceholder
            scm.inputBox.enabled = true
            await vscode.commands.executeCommand('setContext', 'cody.generating-commit-message', false)

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
        const prompt = truncateText(fullPrompt, CHAT_INPUT_TOKEN_BUDGET)

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

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
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

Write a short, single sentence, commit message header for the staged changes
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
