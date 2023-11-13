import * as vscode from 'vscode'

import { getCachedParseTreeForDocument } from '../completions/tree-sitter/parse-tree-cache'

export class DocumentCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.RefactorRewrite]

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
        const tree = getCachedParseTreeForDocument(document)?.tree

        if (!tree) {
            return []
        }

        const node = tree.rootNode.descendantForPosition({ row: range.start.line, column: range.start.character })
        if (node.type !== 'identifier' && node.type !== 'type_identifier') {
            // Nothing useful to document
            return []
        }

        return [this.createCommandCodeAction(document, range, node.text)]
    }

    private createCommandCodeAction(
        document: vscode.TextDocument,
        range: vscode.Range,
        text: string
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(`Ask Cody to Document: ${text}`, vscode.CodeActionKind.RefactorRewrite)
        const source = 'code-action'
        const instruction = 'Document this code'
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [{ instruction, range, intent: 'edit', document }, source],
            title: `Ask Cody to Document: ${text}`,
        }
        return action
    }
}
