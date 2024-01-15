import * as vscode from 'vscode'

import { isWindows, setDisplayPathEnvInfo } from '@sourcegraph/cody-shared'

/** Runs in the VS Code extension host. */
export function manageDisplayPathEnvInfoForExtension(): vscode.Disposable {
    function update(): void {
        setDisplayPathEnvInfo({
            isWindows: isWindows(),
            workspaceFolders: vscode.workspace.workspaceFolders?.map(f => f.uri) ?? [],
        })
    }
    update()
    const disposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        update()
    })
    return disposable
}
