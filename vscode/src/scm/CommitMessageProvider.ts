import * as vscode from 'vscode';
import type { CommitMessageProvider as ICommitMessageProvider, Repository, API as ScmAPI} from '../repository/builtinGitExtension';
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
export interface CommitMessageProviderOptions {
    chatClient: ChatClient,
    gitApi: ScmAPI,
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
        // TODO: handle which changes are actually staged or not?
        // TODO: Logging, metrics & telemetry. I'm too unfamiliar.
        // TODO: Handle cancellation

        const response = await new Promise<string>((resolve, reject) => {

            // TODO: This generates a terrible output but has the basics in place.
            // There's a similar thing in `cli/src/commands` that uses the autocomplete API (since I want structured output.
            // Or should I instead add a recipe in `lib/shared/recipes` and if so how would I execute that so I get some structured output?
            let responseText = '';
            this.options.chatClient.chat(
                [
                    {
                        speaker: 'human',
                        // TODO: The custom command in `cody.json` is what inspired this. But I can't quite find the code where this is translated into
                        text: `Suggest an informative but succinct commit message by summarizing code changes from the shared list of changes.
                        The commit message should follow the conventional commit format and provide meaningful context for future readers.

                        Changes:
                        \`\`\`
                        ${changes.map(c => c).join('\n')}
                        \`\`\`
                        `
                    },
                ],
                {
                    onChange: (text: string) => {
                        responseText = text
                    },
                    onComplete: () => {
                        resolve(responseText)
                    },
                    onError: (error: Error, statusCode?: number) => reject(error),
                },
                {
                    temperature: 0,
                    fast: true,
                }

            )
        })

        return response
    }
}

