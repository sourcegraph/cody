import * as vscode from 'vscode'
import { CodyChatPanelViewType } from '../../chat/chat-view/ChatManager'
import type { AuthProvider } from '../AuthProvider'
import { clearAccessToken, secretStorage } from '../SecretStorageProvider'

/**
 * Resets the extension by clearing all storage data, secretStorage data
 * and clearing any settings. This should put cody back into a pristine state.
 */
export async function fullReset(authProvider: AuthProvider): Promise<void> {
    //TODO(rnauta): make available as command?
    const { endpoint } = authProvider.getAuthStatus()
    if (endpoint) {
        await secretStorage.deleteToken(endpoint)
        await authProvider.auth('', null)
    } else {
        await clearAccessToken()
    }
    //TODO(rnauta): clear global settings

    await vscode.commands.executeCommand('setContext', CodyChatPanelViewType, false)
    await vscode.commands.executeCommand('setContext', 'cody.activated', false)
}
