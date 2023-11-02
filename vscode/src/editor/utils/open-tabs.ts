import * as vscode from 'vscode'

export function getOpenTabsUris(): vscode.Uri[] {
    const uris = []
    // Get open tabs
    const tabGroups = vscode.window.tabGroups.all
    const openTabs = tabGroups.flatMap(group => group.tabs.map(tab => tab.input)) as vscode.TabInputText[]

    for (const tab of openTabs) {
        // Skip non-file URIs
        if (tab?.uri?.scheme === 'file') {
            uris.push(tab.uri)
        }
    }
    return uris
}

export function getOpenTabsRelativePaths(): { title: string; fsPath: string }[] {
    return getOpenTabsUris()?.map(uri => ({
        title: vscode.workspace.asRelativePath(uri.fsPath),
        fsPath: uri.fsPath,
    }))
}
