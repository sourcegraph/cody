import { spawn } from 'node:child_process'
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
    abstract readSecret(): Promise<string>
    abstract writeSecret(secret: string): Promise<void>
    abstract deleteSecret(): Promise<void>
    abstract installationInstructions: string
    protected service(): string {
        const host = new URL(this.account.serverEndpoint).host
        return `Cody: ${host} (${this.account.id})`
    }
    protected spawnAsync(
        command: string,
        args: string[],
        options?: { stdin: string }
    ): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, { stdio: 'pipe', ...options })
            let stdout = ''
            let stderr = ''

            if (options?.stdin) {
                child.stdin.write(options.stdin)
                child.stdin.end()
            }

            child.stdout.on('data', data => {
                stdout += data
            })

            child.stderr.on('data', data => {
                stderr += data
            })

            child.on('error', () => reject(new Error(`child process exited with error: ${stderr}`)))
            child.on('exit', code => {
                if (code !== 0) {
                    reject(new Error(`child process exited with code ${code}. stderr: ${stderr}`))
                } else {
                    resolve({ stdout, stderr })
                }
            })
        })
    }
}

class MacOSKeychain extends KeychainOperations {
    installationInstructions = '' // 'security' is already installed on macOS

    async readSecret(): Promise<string> {
        const { stdout } = await this.spawnAsync('security', [
            'find-generic-password',
            '-s',
            this.service(),
            '-a',
            this.account.username,
            '-w',
        ])
        return stdout.trim()
    }

    async writeSecret(secret: string): Promise<void> {
        await this.spawnAsync('security', [
            'add-generic-password',
            '-s',
            this.service(),
            '-a',
            this.account.username,
            '-w',
            secret,
        ])
    }

    async deleteSecret(): Promise<void> {
        await this.spawnAsync('security', [
            'delete-generic-password',
            '-s',
            this.service(),
            '-a',
            this.account.username,
        ])
    }
}

class WindowsCredentialManager extends KeychainOperations {
    installationInstructions = `To fix this problem, run the command below in PowerShell and try again:
  Install-Module -Name CredentialManager`
    private target(): string {
        return `${this.service()}:${this.account.username}`
    }
    async readSecret(): Promise<string> {
        const powershellCommand = `(Get-StoredCredential -Target "${this.target()}").GetNetworkCredential().Password`
        const { stdout } = await this.spawnAsync('powershell', ['-Command', powershellCommand])
        return stdout.trim()
    }

    async writeSecret(secret: string): Promise<void> {
        const powershellCommand = `& {New-StoredCredential -Target '${this.target()}' -Password '${secret}' -Persist LocalMachine}`
        await this.spawnAsync('powershell', ['-Command', powershellCommand])
    }

    async deleteSecret(): Promise<void> {
        await this.spawnAsync('powershell', [
            '-Command',
            `& {Remove-StoredCredential -Target '${this.service()}:${this.account.username}'}`,
        ])
    }
}

class LinuxSecretService extends KeychainOperations {
    installationInstructions = `To fix this problem, run the commands below and try again:
  sudo apt install libsecret-tools
  sudo apt install gnome-keyring`
    async readSecret(): Promise<string> {
        const { stdout } = await this.spawnAsync('secret-tool', [
            'lookup',
            'service',
            `${this.service()}'`,
            'account',
            `'${this.account.username}'`,
        ])
        return stdout.trim()
    }

    async writeSecret(secret: string): Promise<void> {
        await this.spawnAsync(
            'secret-tool',
            [
                'store',
                '--label',
                this.service(),
                'service',
                this.service(),
                'account',
                this.account.username,
            ],
            { stdin: secret }
        )
    }

    async deleteSecret(): Promise<void> {
        await this.spawnAsync('secret-tool', [
            'clear',
            'service',
            `${this.service()}`,
            'account',
            `'${this.account.username}'`,
        ])
    }
}
