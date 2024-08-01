import * as vscode from 'vscode'

/**
 * Returns a list of all open text editors in the current window.
 */
export const getTextEditorTabs = (): (vscode.Tab & { input: vscode.TabInputText })[] =>
    //@ts-ignore: we typecheck that it's of the correct class instance
    vscode.window.tabGroups.all.flatMap(groups =>
        groups.tabs.filter(tab => tab.input instanceof vscode.TabInputText)
    )
