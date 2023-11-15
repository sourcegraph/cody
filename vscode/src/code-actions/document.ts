import * as vscode from 'vscode'
import Parser from 'web-tree-sitter'

import { getParseLanguage } from '../completions/tree-sitter/grammars'
import { getCachedParseTreeForDocument } from '../completions/tree-sitter/parse-tree-cache'

const isValidDocumentableNode = (node: Parser.SyntaxNode, languageId: string): boolean => {
    const language = getParseLanguage(languageId)

    if (!language) {
        return false
    }

    switch (language) {
        case 'typescript':
        case 'typescriptreact':
        case 'javascript':
        case 'javascriptreact':
            return Boolean(node.type.match(/definition|declaration|declarator|export_statement/))
        // TODO
        case 'java':
        case 'go':
        case 'python':
        case 'csharp':
            return false
        default:
            return Boolean(node.type.match(/definition|declaration|declarator/))
    }
}

export class DocumentCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.RefactorRewrite]

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
        const tree = getCachedParseTreeForDocument(document)?.tree

        if (!tree) {
            return []
        }

        const node = tree.rootNode.descendantForPosition({ row: range.start.line, column: range.start.character })
        if (!isValidDocumentableNode(node, document.languageId)) {
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
