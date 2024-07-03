import keytar from 'keytar'
import { logDebug } from '../../../../vscode/src/log'
import type { Account } from './settings'

// This file deals with reading/writing/removing Cody access tokens from the
// operating system's secret storage (Keychain on macOS, Credential Value on
// Windows, etc.).

const codyServiceName = 'Cody'

function keytarServiceName(account: Account): string {
    const host = new URL(account.serverEndpoint).host
    return `${account.id} on ${host}`
}
export async function writeCodySecret(account: Account, secret: string): Promise<void> {
    try {
        await keytar.setPassword(codyServiceName, keytarServiceName(account), secret)
    } catch (error) {
        logDebug('keytar-storage', 'Error storing secret:', error)
    }
}

export async function readCodySecret(account: Account) {
    try {
        const secret = await keytar.getPassword(codyServiceName, keytarServiceName(account))
        if (secret) {
            return secret
        }
        return null
    } catch (error) {
        logDebug('keytar-storage', 'Error retrieving secret:', error)
        return null
    }
}

export async function removeCodySecret(account: string) {
    try {
        await keytar.deletePassword(codyServiceName, account)
    } catch (error) {
        logDebug('keytar-storage', 'Error deleting secret:', error)
    }
}
