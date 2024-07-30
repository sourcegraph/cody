// biome-ignore lint/style/useImportType: <explanation>
import * as vscode from 'vscode'

// TODO: This needs to be hooked up to CodeActionsProvider with better code actions
// as well.
// Thinking this can register and maintain a cache of diagnostic information
export class DiagnosticsController implements vscode.Disposable {
    dispose() {}
}
