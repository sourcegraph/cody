import * as vscode from 'vscode'

export namespace Uri {
    export function from(uri: vscode.Uri): string {
        return uri.toString() as string
    }

    export function vsc(uri: string): vscode.Uri {
        return vscode.Uri.parse(uri)
    }
}
