import type * as vscode from 'vscode'

export class AgentSnippetTextEdit implements vscode.SnippetTextEdit {
    constructor(
        public range: vscode.Range,
        public snippet: vscode.SnippetString
    ) {}

    public static replace(range: Range, snippet: vscode.SnippetString): vscode.SnippetTextEdit {
        throw new Error('not implemented')
    }

    public static insert(
        position: vscode.Position,
        snippet: vscode.SnippetString
    ): vscode.SnippetTextEdit {
        throw new Error('not implemented')
    }
}
