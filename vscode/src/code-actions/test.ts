import * as vscode from 'vscode'

import type { CodyCommandArgs } from '../commands/types'
import { execQueryWrapper } from '../tree-sitter/query-sdk'

export class TestCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.RefactorRewrite]

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
        const [testableNode] = execQueryWrapper({
            document,
            position: range.start,
            queryWrapper: 'getTestableNode',
        })
        if (!testableNode) {
            return []
        }

        const { range: testableRange, symbol: testableSymbol } = testableNode
        if (!testableSymbol || !testableRange) {
            return []
        }

        // Expand the range from the node to include the full line
        const editorRange = new vscode.Range(
            testableRange.node.startPosition.row,
            testableRange.node.startPosition.column,
            testableRange.node.endPosition.row,
            testableRange.node.endPosition.column
        )

        return [
            this.createCommandCodeAction(
                document,
                editorRange,
                `Cody: Generate Tests for ${testableSymbol.node.text}`
            ),
        ]
    }

    private createCommandCodeAction(
        document: vscode.TextDocument,
        range: vscode.Range,
        displayText: string
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(displayText, vscode.CodeActionKind.RefactorRewrite)
        const source = 'code-action:test'
        action.command = {
            command: 'cody.command.unit-tests',
            arguments: [{ source } satisfies Partial<CodyCommandArgs>],
            title: displayText,
        }
        return action
    }
}
