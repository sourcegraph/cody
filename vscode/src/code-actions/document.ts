import * as vscode from 'vscode'
import Parser from 'web-tree-sitter'

import { getCachedParseTreeForDocument } from '../completions/tree-sitter/parse-tree-cache'

const getDocumentableNodeForPosition = (
    document: vscode.TextDocument,
    position: vscode.Position
): Parser.SyntaxNode | null => {
    const parseTreeCache = getCachedParseTreeForDocument(document)

    if (!parseTreeCache) {
        return null
    }

    const { parser, tree } = parseTreeCache

    const language = parser.getLanguage()

    const node = language
        .query(
            `
(function_declaration
    name: (identifier) @function.name)
    `
        )
        .matches(tree.rootNode, { row: position.line, column: position.character })

    console.log(node[0].captures[0].node.text)
    // TODO: Language specific checks for allowed documentable nodes

    return null
}

export class DocumentCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.RefactorRewrite]

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
        const documentableNode = getDocumentableNodeForPosition(document, range.start)

        if (!documentableNode) {
            return []
        }

        return [this.createCommandCodeAction(document, range, documentableNode.text)]
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
