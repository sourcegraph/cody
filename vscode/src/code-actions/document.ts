import * as vscode from 'vscode'

import type { CodyCommandArgs } from '../commands/types'
import { execQueryWrapper } from '../tree-sitter/query-sdk'
import { CodyCodeActionKind } from './kind'

export class DocumentCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        CodyCodeActionKind.RefactorRewrite.append('documentCode'),
    ] as const
    public static readonly documentSelector = '*'

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
        const [documentableNode] = execQueryWrapper({
            document,
            position: range.start,
            queryWrapper: 'getDocumentableNode',
        })
        if (!documentableNode) {
            return []
        }

        const { range: documentableRange, symbol: documentableSymbol } = documentableNode
        if (!documentableSymbol || !documentableRange) {
            return []
        }

        // Expand the range from the node to include the full line
        const editorRange = new vscode.Range(
            documentableRange.node.startPosition.row,
            documentableRange.node.startPosition.column,
            documentableRange.node.endPosition.row,
            documentableRange.node.endPosition.column
        )
        return [
            this.createCommandCodeAction(
                document,
                editorRange,
                `Cody: Generate Documentation for ${documentableSymbol.node.text}`
            ),
        ]
    }

    private createCommandCodeAction(
        document: vscode.TextDocument,
        range: vscode.Range,
        displayText: string
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(displayText, DocumentCodeAction.providedCodeActionKinds[0])
        const source = 'code-action:document'
        action.command = {
            command: 'cody.command.document-code',
            arguments: [{ source } satisfies Partial<CodyCommandArgs>],
            title: displayText,
        }
        return action
    }
}
