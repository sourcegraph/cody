import * as vscode from 'vscode'

import { execQueryWrapper } from '../tree-sitter/query-sdk'
import type { CodyCommandArgs } from '../commands/types'

export class DocumentCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.RefactorRewrite]

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
        const [documentableNode] = execQueryWrapper(document, range.start, 'getDocumentableNode')

        if (!documentableNode.symbol || !documentableNode.range) {
            return []
        }

        // Expand the range from the node to include the full line
        const documentableRange = new vscode.Range(
            documentableNode.range.node.startPosition.row,
            documentableNode.range.node.startPosition.column,
            documentableNode.range.node.endPosition.row,
            documentableNode.range.node.endPosition.column
        )
        return [
            this.createCommandCodeAction(
                document,
                documentableRange,
                `Ask Cody to Document: ${documentableNode.symbol.node.text}`
            ),
        ]
    }

    private createCommandCodeAction(
        document: vscode.TextDocument,
        range: vscode.Range,
        displayText: string
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(displayText, vscode.CodeActionKind.RefactorRewrite)
        const source = 'code-action:document'
        action.command = {
            command: 'cody.command.document-code',
            arguments: [{ source } satisfies Partial<CodyCommandArgs>],
            title: displayText,
        }
        return action
    }
}
