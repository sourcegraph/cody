import * as vscode from 'vscode'

import { isRateLimitError } from '@sourcegraph/cody-shared/dist/sourcegraph-api/errors'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CommitMessage as CommitMessageRecipe } from '@sourcegraph/cody-shared/src/chat/recipes/generate-commit-message'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { Editor } from '@sourcegraph/cody-shared/src/editor'

import type {
    Repository,
    API as ScmAPI,
    CommitMessageProvider as VSCodeCommitMessageProvider,
} from '../repository/builtinGitExtension'

export interface CommitMessageProviderOptions {
    chatClient: ChatClient
    editor: Editor
    gitApi: ScmAPI
    recipe: CommitMessageRecipe
}

export interface CommitMessageGuide {
    template?: string
}

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

    public dispose(): void {
        this.disposables.forEach(d => d.dispose())
    }
    public async provideCommitMessage(
        repository: Repository,
        changes: string[],
        cancellationToken?: any
    ): Promise<string | undefined> {
        //TODO: Handle cancellation

        // we ignore the changes coming form VSCode here as the resulting commit messages were just not as good
        // it could maybe be something to fall back on for web, but the recipe doesn't work for that atm. anyways.
        const humanPrompt = await this.options.recipe.getHumanPrompt(undefined, this.options)
        if (!humanPrompt) {
            return Promise.reject()
        }

        const { isEmpty, prompt } = humanPrompt
        if (isEmpty) {
            return ''
        }

        let completion = ''

        try {
            await new Promise((resolve, reject) => {
                this.options.chatClient.chat(
                    [
                        { speaker: 'human', text: prompt },
                        {
                            speaker: 'assistant',
                            text: 'Here is a suggested commit message for the diff:\n\n<commit-message>',
                        },
                    ],
                    {
                        onComplete: () => {
                            resolve(completion.slice(0, completion.indexOf('</commit-message>')).trim())
                        },
                        onError: error => {
                            reject(error)
                        },
                        onChange: text => {
                            completion = text
                        },
                    },
                    {
                        maxTokensToSample: 1000,
                        temperature: 0,
                        stopSequences: ['</commit-message>'],
                    }
                )
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

        // I was adding a truncated message before, but because it's simply a suggesting anyways
        // it didn't actually feel as helpful as I first thought.
        return completion.trim()
    }
}
