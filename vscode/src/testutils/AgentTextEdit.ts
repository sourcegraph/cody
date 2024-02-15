import type * as vscode from 'vscode'

export class AgentTextEdit implements vscode.TextEdit {
    public metadata?: vscode.WorkspaceEditEntryMetadata
    constructor(
        public readonly range: vscode.Range,
        public readonly newText: string,
        public readonly newEol?: vscode.EndOfLine
    ) {}
    public static replace(range: vscode.Range, newText: string): vscode.TextEdit {
        throw new Error('not implemented')
    }

    public static insert(position: vscode.Position, newText: string): vscode.TextEdit {
        throw new Error('not implemented')
    }

    public static delete(range: vscode.Range): vscode.TextEdit {
        throw new Error('not implemented')
    }

    public static setEndOfLine(eol: vscode.EndOfLine): vscode.TextEdit {
        throw new Error('not implemented')
    }
}
