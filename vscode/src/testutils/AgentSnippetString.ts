import type * as vscode from 'vscode'

export class AgentSnippetString implements vscode.SnippetString {
    public value = ''
    constructor(value?: string) {
        if (value) {
            this.value = value
        }
    }
    public appendText(string: string): vscode.SnippetString {
        throw new Error('Method not implemented.')
    }
    public appendTabstop(number?: number | undefined): vscode.SnippetString {
        throw new Error('Method not implemented.')
    }
    public appendPlaceholder(
        value: string | ((snippet: vscode.SnippetString) => any),
        number?: number | undefined
    ): vscode.SnippetString {
        throw new Error('Method not implemented.')
    }
    public appendChoice(values: readonly string[], number?: number | undefined): vscode.SnippetString {
        throw new Error('Method not implemented.')
    }
    public appendVariable(
        name: string,
        defaultValue: string | ((snippet: vscode.SnippetString) => any)
    ): vscode.SnippetString {
        throw new Error('Method not implemented.')
    }
}
