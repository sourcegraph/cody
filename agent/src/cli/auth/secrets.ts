import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logDebug } from '../../../../vscode/src/log'
import type { Account } from './settings'

// This file deals with reading/writing/removing Cody access tokens from the
// operating system's secret storage (Keychain on macOS, Credential Value on
// Windows, etc.). Originally, we used the `keytar` npm dependency to interact
// with the OS secret storage. However, Keytar is unmaintained and it was
// complicated to distribute anyways because you had to distribute native
// modules for each supported OS. The current implementation shells out to the
// `security` command on macOS, `powershell` on Windows, and `secret-tool` on
// Linux. Users can always set the `CODY_ACCESS_TOKEN` environment variable if
// they don't want to use this functionality.
//
// The biggest problem with this approach is that users will most likely select
// "Always allow" when prompted if the "system" tool can access the Cody
// secrets. This means that any other tool on the computer can shell out to
// `system` to read the same secret. However, we chose to go with this approach
// regardless of this risk based on the following observations:
// - The user can chose not to let Cody manage its secrets. This is an optional feature.
// - Storing the secret as a global environment variable also isn't secure.
// - The `gh` cli tool uses the same approach (shelling out to `security` on macOS),
//   meaning that any tool on my computer can read my GitHub access token by shelling out
//   to `security` without me knowing.
// - It's marginally more secure to build a native module instead of using
//   `system` because a malicious user can also load the native module instead
//   of shelling out to `system` to fake that it's Cody cli.

export async function writeCodySecret(account: Account, secret: string): Promise<void> {
    const keychain = getKeychainOperations(account)
    try {
        await keychain.writeSecret(secret)
    } catch (error) {
        logDebug('keychain-storage', 'Error storing secret:', error)
    }
}

export async function readCodySecret(account: Account) {
    const keychain = getKeychainOperations(account)
    try {
        const secret = await keychain.readSecret()
        if (secret) {
            return secret
        }
        return null
    } catch (error) {
        logDebug('keychain-storage', 'Error retrieving secret:', error)
        return null
    }
}

export async function removeCodySecret(account: Account) {
    const keychain = getKeychainOperations(account)
    try {
        await keychain.deleteSecret()
    } catch (error) {
        logDebug('keychain-storage', 'Error deleting secret:', error)
    }
}

const execAsync = promisify(exec)
function getKeychainOperations(account: Account): KeychainOperations {
    switch (process.platform) {
        case 'darwin':
            return new MacOSKeychain(account)
        case 'win32':
            return new WindowsCredentialManager(account)
        case 'linux':
            return new LinuxSecretService(account)
        default:
            throw new Error(`Unsupported platform: ${process.platform}`)
    }
}

/**
 * Uses each operating system's native keychain to store the Cody access token.
 * - `security` on macOS
 * - `powershell -command '...StoredCredential ...` on Windows
 * - `secret-tool` on Linux
 */
abstract class KeychainOperations {
    constructor(public account: Account) {}
    protected service(): string {
        const host = new URL(this.account.serverEndpoint).host
        return `Cody: ${host} (${this.account.id})`
    }
    abstract readSecret(): Promise<string>
    abstract writeSecret(secret: string): Promise<void>
    abstract deleteSecret(): Promise<void>
}

class MacOSKeychain extends KeychainOperations {
    async readSecret(): Promise<string> {
        const { stdout } = await execAsync(
            `security find-generic-password -s "${this.service()}" -a "${this.account.username}" -w`
        )
        return stdout.trim()
    }

    async writeSecret(secret: string): Promise<void> {
        await execAsync(
            `security add-generic-password -s "${this.service()}" -a "${
                this.account.username
            }" -w "${secret}"`
        )
    }

    async deleteSecret(): Promise<void> {
        await execAsync(
            `security delete-generic-password -s "${this.service()}" -a "${this.account.username}"`
        )
    }
}

class WindowsCredentialManager extends KeychainOperations {
    async readSecret(): Promise<string> {
        const powershellCommand = `(Get-StoredCredential -Target "${this.service()}:${
            this.account.username
        }").GetNetworkCredential().Password`
        const { stdout } = await execAsync(
            `powershell -Command "${powershellCommand.replace(/"/g, '\\"')}"`
        )
        return stdout.trim()
    }

    async writeSecret(secret: string): Promise<void> {
        await execAsync(
            `powershell -command "& {New-StoredCredential -Target '${this.service()}:${
                this.account.username
            }' -UserName '${this.account.username}' -Password '${secret}' -Persist LocalMachine}"`
        )
    }

    async deleteSecret(): Promise<void> {
        await execAsync(
            `powershell -command "& {Remove-StoredCredential -Target '${this.service()}:${
                this.account.username
            }'}"`
        )
    }
}

class LinuxSecretService extends KeychainOperations {
    async readSecret(): Promise<string> {
        const { stdout } = await execAsync(
            `secret-tool lookup service '${this.service()}' account '${this.account.username}'`
        )
        return stdout.trim()
    }

    async writeSecret(secret: string): Promise<void> {
        await execAsync(
            `echo "${secret}" | secret-tool store --label="${this.service()}" service '${this.service()}' account ${
                this.account.username
            }`
        )
    }

    async deleteSecret(): Promise<void> {
        await execAsync(
            `secret-tool clear service '${this.service()}' account '${this.account.username}'`
        )
    }
}
