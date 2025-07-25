import { type AuthenticatedAuthStatus, currentAuthStatusAuthed } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { ACCOUNT_USAGE_URL } from '../chat/protocol'
import { showSignInMenu, showSignOutMenu } from './auth'

export async function showAccountMenu(): Promise<void> {
    const authStatus = currentAuthStatusAuthed()
    const selected = await openAccountMenuFirstStep(authStatus)
    if (selected === undefined) {
        return
    }

    switch (selected) {
        case AccountMenuOptions.Manage: {
            // Add the username to the web can warn if the logged in session on web is different from VS Code
            const uri = vscode.Uri.parse(ACCOUNT_USAGE_URL.toString()).with({
                query: `cody_client_user=${encodeURIComponent(authStatus.username)}`,
            })
            void vscode.env.openExternal(uri)
            break
        }
        case AccountMenuOptions.Switch:
            await showSignInMenu()
            break
        case AccountMenuOptions.SignOut:
            await showSignOutMenu()
            break
    }
}

enum AccountMenuOptions {
    SignOut = 'Sign Out',
    Manage = 'Manage Account',
    Switch = 'Switch Account...',
}

async function openAccountMenuFirstStep(
    authStatus: AuthenticatedAuthStatus
): Promise<AccountMenuOptions | undefined> {
    const username = authStatus.username || authStatus.displayName
    const enterpriseDetail = `Enterprise Instance:\n${authStatus.endpoint}`

    const options = []
    options.push(AccountMenuOptions.Switch, AccountMenuOptions.SignOut)

    const messageOptions = {
        modal: true,
        detail: enterpriseDetail,
    }

    const message = `Signed in as @${username}`

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
