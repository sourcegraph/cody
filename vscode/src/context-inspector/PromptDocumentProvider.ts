import * as tokenizer from '@anthropic-ai/tokenizer'
import * as vscode from 'vscode'

export function countToken2(text: string): number {
    /*
    const tokenizer = getTokenizer();
    const encoded = tokenizer.encode(text.normalize('NFKC'), 'all');
    tokenizer.free();
 */
    return tokenizer.countTokens(text)
}

export class PromptDocumentProvider implements vscode.Disposable, vscode.TextDocumentContentProvider {
    private readonly changeEventEmitter = new vscode.EventEmitter<vscode.Uri>()
    public readonly onDidChange?: vscode.Event<vscode.Uri> = this.changeEventEmitter.event
    private disposables: vscode.Disposable[] = []

    constructor() {
        this.disposables.push(vscode.workspace.registerTextDocumentContentProvider('cody-context', this))

        this.disposables.push(
            vscode.commands.registerCommand('cody.context.openPrompt', () => {
                void vscode.window.showTextDocument(vscode.Uri.parse('cody-context://prompt'), {
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
        return 'hello, world from ' + uri.toString()
    }
}
