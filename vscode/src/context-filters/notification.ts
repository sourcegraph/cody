import * as vscode from 'vscode'
// import { repoNameResolver } from '../repository/repo-name-resolver'
// import { localStorage } from '../services/LocalStorageProvider'

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
    // const repos = await repoNameResolver.getRepoNamesFromWorkspaceUri(uri)

    // If we can't find a repo for the resolved file, we won't be showing a
    // notification since we have no way to silence the message properly
    // if (!repos || repos.length === 0) {
    //     return
    // }

    // const isAnyRepoDismissed = repos.some(repo =>
    //     localStorage.get('cody-ignore-notification-dismissed-' + repo)
    // )

    // if (isAnyRepoDismissed) {
    //     return
    // }

    // await Promise.all(
    //     repos.map(repo => localStorage.set('cody-ignore-notification-dismissed-' + repo, 'true'))
    // )

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
