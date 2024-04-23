import * as vscode from 'vscode'
import { repoNameResolver } from '../repository/repo-name-resolver'
import { localStorage } from '../services/LocalStorageProvider'

export type CodyIgnoreType = 'cody-ignore' | 'context-filter'

export async function notifyCodyIgnored(uri: vscode.Uri, type: CodyIgnoreType): Promise<void> {
    // Do not notify on .cody/ignore matches
    if (type === 'cody-ignore') {
        return
    }
    const repos = await repoNameResolver.getRepoNamesFromWorkspaceUri(uri)

    console.log(repos)

    // If we can't find a repo for the resolved file, we won't be showing a
    // notification since we have no way to silence the message properly
    if (!repos || repos.length === 0) {
        return
    }

    const isAnyRepoDismissed = repos.some(repo =>
        localStorage.get('cody-ignore-notification-dismissed-' + repo)
    )

    if (isAnyRepoDismissed) {
        return
    }

    // await Promise.all(
    //     repos.map(repo => localStorage.set('cody-ignore-notification-dismissed-' + repo, 'true'))
    // )

    vscode.window.showInformationMessage('Your administrator has disabled Cody in this repository.')
}
