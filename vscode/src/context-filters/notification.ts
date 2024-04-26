import * as vscode from 'vscode'

export type CodyIgnoreType = 'cody-ignore' | 'context-filter'

/**
 * A passive notification should be used for features that do not require the
 * user to initiate them (e.g. Autocomplete, Supercompletion).
 *
 * TODO: Add dismissing logic
 */
export async function passiveNotification(uri: vscode.Uri, type: CodyIgnoreType): Promise<void> {
    // Do not notify on .cody/ignore matches
    if (type === 'cody-ignore') {
        return
    }

    vscode.window.showInformationMessage('Cody ignores this file because of your admin policy.')
}

export async function activeNotification(
    uri: vscode.Uri | undefined,
    type: CodyIgnoreType
): Promise<void> {
    vscode.window.showErrorMessage(
        type === 'context-filter'
            ? 'Cody has ignored this file because of your Sourcegraph admin policy.'
            : 'Cody has ignored this file because of your cody ignore config.'
    )
}
