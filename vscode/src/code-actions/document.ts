import * as vscode from 'vscode'

import { execQueryWrapper } from '../tree-sitter/query-sdk'

export class DocumentCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.RefactorRewrite]

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
        const [documentableNode] = execQueryWrapper(document, range.start, 'getDocumentableNode')

        if (!documentableNode) {
            return []
        }

        const { node, name } = documentableNode
        // Expand the range from the node to include the full line
        const documentableRange = new vscode.Range(
            document.lineAt(node.startPosition.row).range.start,
            document.lineAt(node.endPosition.row).range.end
        )
        const displayText =
            name === 'documentableNode' ? `Ask Cody to Document: ${node.text}` : 'Ask Cody to Document This Export'

        return [this.createCommandCodeAction(document, documentableRange, displayText)]
    }

    private createCommandCodeAction(
        document: vscode.TextDocument,
        range: vscode.Range,
        displayText: string
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(displayText, vscode.CodeActionKind.RefactorRewrite)
        const source = 'code-action'
        const instruction = 'Document this code'
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [{ instruction, range, intent: 'edit', document }, source],
            title: displayText,
        }
        return action
    }
}
