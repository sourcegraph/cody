import * as vscode from 'vscode'

import { ExecuteEditArguments } from '../edit/execute'
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
        const source = 'code-action:document'
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [
                {
                    instruction: this.instruction,
                    range,
                    intent: 'doc',
                    document,
                    insertMode: true,
                } satisfies ExecuteEditArguments,
                source,
            ],
            title: displayText,
        }
        return action
    }

    /**
     * Edit instruction for generating documentation.
     * Note: This is a clone of the hard coded instruction in `lib/shared/src/chat/prompts/cody.json`.
     * TODO: (umpox) Consider moving top level instructions out of the JSON format.
     */
    private readonly instruction =
        'Write a brief documentation comment for the selected code. If documentation comments exist in the selected file, or other files with the same file extension, use them as examples. Pay attention to the scope of the selected code (e.g. exported function/API vs implementation detail in a function), and use the idiomatic style for that type of code scope. Only generate the documentation for the selected code, do not generate the code. Do not output any other code or comments besides the documentation. Output only the comment and do not enclose it in markdown.'
}
