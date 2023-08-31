import * as tokenizer from '@anthropic-ai/tokenizer'
import * as vscode from 'vscode'

import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

export function countToken2(text: string): number {
    /*
    const tokenizer = getTokenizer();
    const encoded = tokenizer.encode(text.normalize('NFKC'), 'all');
    tokenizer.free();
 */
    return tokenizer.countTokens(text)
}

const PROMPT_DOCUMENT_URI = vscode.Uri.parse('cody-context://prompt')

export class PromptDocumentProvider implements vscode.Disposable, vscode.TextDocumentContentProvider {
    private readonly changeEventEmitter = new vscode.EventEmitter<vscode.Uri>()
    public readonly onDidChange?: vscode.Event<vscode.Uri> = this.changeEventEmitter.event
    private disposables: vscode.Disposable[] = []
    private content = '(no prompt has been observed yet)'

    constructor() {
        this.disposables.push(vscode.workspace.registerTextDocumentContentProvider('cody-context', this))

        this.disposables.push(
            vscode.commands.registerCommand('cody.context.openPrompt', () => {
                void vscode.window.showTextDocument(PROMPT_DOCUMENT_URI, {
                    viewColumn: vscode.ViewColumn.One,
                })
            })
        )
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }

    public provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
        if (uri.authority !== 'prompt') {
            throw new Error('Unhandled URI, expected prompt was ' + uri.authority)
        }
        return this.content
    }

    public setPrompt(messages: readonly Message[]): void {
        this.content = messages
            .map((message: Message) => `${speakerToLabel(message.speaker)}: ${message.text || ''}`)
            .join('\n\n')
        this.changeEventEmitter.fire(PROMPT_DOCUMENT_URI)
    }
}

function speakerToLabel(speaker: string): string {
    switch (speaker) {
        case 'human':
            return 'Human'
        case 'assistant':
            return 'Assistant'
        default:
            return 'fix speakerToLabel, unknown speaker, ' + speaker
    }
}
