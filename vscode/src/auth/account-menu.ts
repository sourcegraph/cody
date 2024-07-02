import { type AuthStatus, isDotCom } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

export enum AccountMenuOptions {
    SignOut = 'Sign Out',
    Manage = 'Manage Account',
    Switch = 'Switch Account...',
}

export async function openAccountMenu(authStatus: AuthStatus): Promise<AccountMenuOptions | undefined> {
    if (!authStatus.authenticated || !authStatus.endpoint) {
        return
    }

    const isOffline = authStatus.isOfflineMode
    const isDotComInstance = isDotCom(authStatus.endpoint) && !isOffline

    const displayName = authStatus.displayName || authStatus.username
    const email = authStatus.primaryEmail || 'No Email'
    const username = authStatus.username || authStatus.displayName
    const planDetail = `Plan: ${authStatus.userCanUpgrade ? 'Cody Free' : 'Cody Pro'}`
    const enterpriseDetail = `Enterprise Instance:\n${authStatus.endpoint}`
    const offlineDetail = 'Use Cody offline with Ollama'

    const options = isDotComInstance ? [AccountMenuOptions.Manage] : []
    options.push(AccountMenuOptions.Switch, AccountMenuOptions.SignOut)

    const messageOptions = {
        modal: true,
        detail: isOffline ? offlineDetail : isDotComInstance ? planDetail : enterpriseDetail,
    }

    const online = isDotComInstance
        ? `Signed in as ${displayName} (${email})`
        : `Signed in as @${username}`
    const offline = 'Offline Mode'
    const message = isOffline ? offline : online

    const option = await vscode.window.showInformationMessage(message, messageOptions, ...options)

    switch (option !== undefined) {
        case option?.startsWith('Sign Out'):
            return AccountMenuOptions.SignOut
        case option?.startsWith('Manage'):
            return AccountMenuOptions.Manage
        case option?.startsWith('Switch'):
            return AccountMenuOptions.Switch
        default:
            return undefined
    }
}
