import * as vscode from 'vscode';
import type { CommitMessageProvider as ICommitMessageProvider, Repository, API as ScmAPI} from '../repository/builtinGitExtension';
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { isRateLimitError } from '@sourcegraph/cody-shared/dist/sourcegraph-api/errors'

import { CodeCompletionsClient } from '../completions/client'
import dedent from 'dedent'
export interface CommitMessageProviderOptions {
    chatClient: ChatClient,
    codeCompletionsClient: CodeCompletionsClient
    gitApi: ScmAPI,
}

export interface CommitMessageGuide {
    examples?: string[],
    template?: string
}

export class CommitMessageProvider implements ICommitMessageProvider, vscode.Disposable {
    public icon = new vscode.ThemeIcon('cody-logo');
    public title = 'Generate Commit Message (Cody)'

    private disposables: vscode.Disposable[] = []
    private _subscription?: vscode.Disposable;

    constructor(private readonly options: CommitMessageProviderOptions) {}

    public onConfigurationChange(config: ConfigurationWithAccessToken): void {
		if(config.experimentalCommitMessage){
            this._subscription = this.options.gitApi.registerCommitMessageProvider?.(this);
        }else {
            this._subscription?.dispose();
            this._subscription = undefined;
        }
	}

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
    public async provideCommitMessage(repository: Repository, changes: string[], cancellationToken?: any): Promise<string | undefined> {
        // TODO: load commit template from settings
        // TODO: Logging, metrics & telemetry.
        // TODO: Handle loading of examples? Maybe a query for similar commits based on the changes?
        // TODO: Handle cancellation
        if(changes.length == 0){
            return Promise.reject()
        }
        try {
            return await this.generateCommitMessage(changes)
        }catch(error){
            if(isRateLimitError(error)){
                //TODO: we probably want a typed union of all commands & arg arrays somewhere?
                await vscode.commands.executeCommand('cody.show-rate-limit-modal',
                ...[error.userMessage, error.retryMessage, error.upgradeIsAvailable])
            }
            throw error
        }
    }

    private async generateCommitMessage(changes: string[], guide: CommitMessageGuide = {}): Promise<string> {
        // TODO: ideally this would me moved to a shared module so we can add way more smart context logic to it
        // that can be used in similar places like similar to  a similar thing in `@cli/src/commands/generateCommitMessage.ts`

        const template = guide.template?.trim() || 'A commit message consists of scoped title of max 72 characters, and a body with additional details about and reasons for the change. Commit messages are concise, technical, and specific to the change. They also mention any UI or user-facing changes.'
        const examples = guide.examples?.map(msg => dedent`
            <commit-message>
            ${msg.trim()}
            </commit-message>
        `) || [
            dedent`
            <commit-message>
            feat(app): add new feature

            - adds new UX elements
            - updated tests
            - improves the way teh feature loads data
            </commit-message>
        `]

        const instructions: Message[] = [
            {speaker: 'human', text: template},
            {speaker: 'human', text: dedent`
            Here are a few examples:
            <examples>
                ${examples.map(example => `<example>
                    ${example}
                </example>`).join('\n')}
            </examples>`
            },
            {speaker: 'human', text: dedent`
            Here is a diff:
            <diffs>
                ${changes.map(diff => `<diff>
                    ${diff}
                </diff>`).join('\n')}
            </diffs>
            `}, // IDEA: handle max / pick most important changes?
            {
                speaker: 'human',
                text: 'Based on the the instructions and examples write a commit message for the diff.'
            },
            {
                speaker: 'assistant',
                text: '<commit-message>'
            }
        ]

        const {completion, stopReason: _} = await this.options.codeCompletionsClient.complete({
            maxTokensToSample: 1000,
            messages: instructions,
            temperature: 0,
            stopSequences: ['</commit-message>'],
            timeoutMs: 5000 // TODO: is there a standard defined somewhere? Is this including network latency or the "model" timeout?
        })
        return completion.slice(0, completion.indexOf('/commit-message')).trim()

        // TODO: check if we completed succesfully. Bit difficult now because response.stopReason isn't typed

    }
}

