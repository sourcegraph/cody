import type * as vscode from 'vscode'

export const CURSOR_RANGE_ITEM: vscode.QuickPickItem = {
    label: '$(edit) Cursor Position',
    description: 'Insert new code at the cursor',
    alwaysShow: true,
}

export const SELECTION_RANGE_ITEM: vscode.QuickPickItem = {
    label: '$(code) Selection',
    alwaysShow: true,
}

export const EXPANDED_RANGE_ITEM: vscode.QuickPickItem = {
    label: '$(file-code) Nearest Code Block',
    alwaysShow: true,
}
