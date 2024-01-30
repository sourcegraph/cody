import type * as vscode from 'vscode'

export const CURSOR_RANGE_ITEM: vscode.QuickPickItem = {
    label: '$(edit) Cursor Position',
    description: 'Insert new code at the cursor',
}

export const SELECTION_RANGE_ITEM: vscode.QuickPickItem = {
    label: '$(code) Selection',
    alwaysShow: true,
}

export const EXPANDED_RANGE_ITEM: vscode.QuickPickItem = {
    label: '$(file-code) Expanded selection',
    description: 'Expand the selection to the nearest block of code',
}

export const MAXIMUM_RANGE_ITEM: vscode.QuickPickItem = {
    label: '$(symbol-file) Maximum',
    description: 'The maximum expanded selection',
}
