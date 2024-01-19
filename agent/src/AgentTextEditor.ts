import * as vscode from 'vscode'

import { type AgentTextDocument } from './AgentTextDocument'

export function newTextEditor(document: AgentTextDocument): vscode.TextEditor {
    const selection: vscode.Selection = document.underlying.selection
        ? new vscode.Selection(
              new vscode.Position(
                  document.underlying.selection.start.line,
                  document.underlying.selection.start.character
              ),
              new vscode.Position(document.underlying.selection.end.line, document.underlying.selection.end.character)
          )
        : new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))

    return {
        // Looking at the implementation of the extension, we only need
        // to provide `document` but we do a best effort to shim the
        // rest of the `TextEditor` properties.
        document,
        selection,
        selections: [selection],
        edit: () => Promise.resolve(true),
        insertSnippet: () => Promise.resolve(true),
        revealRange: () => {},
        options: {
            cursorStyle: undefined,
            insertSpaces: undefined,
            lineNumbers: undefined,
            // TODO: fix tabSize
            tabSize: 2,
        },
        setDecorations: () => {},
        viewColumn: vscode.ViewColumn.Active,
        visibleRanges: [selection],
        show: () => {},
        hide: () => {},
    }
}
