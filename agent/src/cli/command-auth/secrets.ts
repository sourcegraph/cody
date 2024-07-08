import { execSync, spawn } from 'node:child_process'
import type { Ora } from 'ora'
import { logDebug } from '../../../../vscode/src/log'
import type { Account } from './settings'

// This file deals with reading/writing/removing Cody access tokens from the
// operating system's secret storage (Keychain on macOS, Credential Value on
// Windows, etc.). Originally, we used the `keytar` npm dependency to interact
// with the OS secret storage. However, Keytar is unmaintained and it was
// complicated to distribute anyways because you had to distribute native
// modules for each supported OS. The current implementation shells out to the
// `security` command on macOS, `CredentialManager` on Windows, and `secret-tool` on
// Linux. This is an o)ptional feature. Users can always avoid using this functionality
// by setting the `CODY_ACCESS_TOKEN` environment variable or passing the `--access-token`
// command line argument.
//
// One problem with this custom solution is that users will most likely
// select "Always allow" on macOS when prompted if the "system" tool can access the Cody
// secrets. This means that any other tool on the computer can shell out to
// `system` to read the same secret. However, we chose to go with this approach on macOS
// regardless of this risk based on the following observations:
// - The user can chose not to let Cody manage its secrets. This is an optional feature.
// - Storing the secret as a global environment variable also isn't secure
//   because it means any process on the computer can read the same
//   SRC_ACCESS_TOKEN environment variable without custom work. With the secret manager,
//   a malicious user needs to know at least the Sourcegraph server endpoint URL and the
//   user's username (both easy to access information, but still more inconvenient than
//   reading an environment variable).
// - The `gh` cli tool uses the same approach (shelling out to `security` on macOS),
//   meaning that any tool on my computer can read my GitHub access token by shelling out
//   to `security` without me knowing. I have not reviewed what `gh` does on
//   Windows or Linux.
// - The ideal solution would be to do something similar to IntelliJ does, which is to
//   build a native module that is a signed Sourcegraph application and is very inconvenient
//   to run outside of the the `cody` cli tool (not obvious how to do this). Keytar delivers
//   some of these benefits with a native Node.js module.

export async function writeCodySecret(spinner: Ora, account: Account, secret: string): Promise<void> {
    const keychain = getKeychainOperations(spinner, account)
    try {
        await keychain.writeSecret(secret)
    } catch (error) {
        logDebug('keychain-storage', 'Error storing secret:', error)
    }
}

export async function readCodySecret(spinner: Ora, account: Account) {
    const keychain = getKeychainOperations(spinner, account)
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

export async function removeCodySecret(spinner: Ora, account: Account) {
    const keychain = getKeychainOperations(spinner, account)
    try {
        await keychain.deleteSecret()
    } catch (error) {
        logDebug('keychain-storage', 'Error deleting secret:', error)
    }
}

function getKeychainOperations(spinner: Ora, account: Account): KeychainOperations {
    switch (process.platform) {
        case 'darwin':
            return new MacOSKeychain(spinner, account)
        case 'win32':
            return new WindowsCredentialManager(spinner, account)
        case 'linux':
            return new LinuxSecretService(spinner, account)
        default:
            throw new Error(`Unsupported platform: ${process.platform}`)
    }
}

abstract class KeychainOperations {
    constructor(
        public spinner: Ora,
        public account: Account
    ) {}
    abstract readSecret(): Promise<string>
    abstract writeSecret(secret: string): Promise<void>
    abstract deleteSecret(): Promise<void>
    protected service(): string {
        const host = new URL(this.account.serverEndpoint).host
        return `Cody: ${host} (${this.account.id})`
    }
    protected spawnAsync(command: string, args: string[], options?: { stdin: string }): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const child = spawn(command, args, { stdio: 'pipe', ...options })
            let stdout = ''
            let stderr = ''
            child.stdout.on('data', data => {
                stdout += data
            })

            child.stderr.on('data', data => {
                stderr += data
            })

            if (options?.stdin) {
                child.stdin.write(options.stdin)
                child.stdin.end()
            }

            child.on('exit', code => {
                if (code !== 0) {
                    reject(
                        new Error(`command failed: ${command} ${args.join(' ')}\n${stdout}\n${stderr}`)
                    )
                } else {
                    resolve(stdout.trim())
                }
            })
        })
    }
}

class MacOSKeychain extends KeychainOperations {
    installationInstructions = ''
    async readSecret(): Promise<string> {
        return await this.spawnAsync('security', [
            'find-generic-password',
            '-s',
            this.service(),
            '-a',
            this.account.username,
            '-w',
        ])
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
const alternativelyMessage =
    'Alternatively, you can manually supply an access token with --access-token or the environment variable SRC_ACCESS_TOKEN'

class WindowsCredentialManager extends KeychainOperations {
    installationInstructions = `The 'CredentialManager' PowerShell module needs to be installed to let Cody manage your access token.
To fix this problem, run the command below to install the missing dependencies:
  Install-Module -Name CredentialManager
${alternativelyMessage}`
    private target(): string {
        return `${this.service()}:${this.account.username}`.replaceAll('"', '_')
    }
    async readSecret(): Promise<string> {
        const powershellCommand = `(Get-StoredCredential -Target "${this.target()}").GetNetworkCredential().Password`
        return await this.spawnAsync('powershell.exe', ['-Command', powershellCommand])
    }

    override async spawnAsync(
        command: string,
        args: string[],
        options?: { stdin: string } | undefined
    ): Promise<string> {
        try {
            return await super.spawnAsync(command, args, options)
        } catch (error) {
            this.spinner.fail(this.installationInstructions)
            throw error
        }
    }

    async writeSecret(secret: string): Promise<void> {
        const powershellCommand = `& {New-StoredCredential -Target '${this.target()}' -Password '${secret}' -Persist LocalMachine}`
        await this.spawnAsync('powershell.exe', ['-Command', powershellCommand])
    }

    async deleteSecret(): Promise<void> {
        await this.spawnAsync('powershell.exe', [
            '-Command',
            `& {Remove-StoredCredential -Target '${this.service()}:${this.account.username}'}`,
        ])
    }
}

class LinuxSecretService extends KeychainOperations {
    private installationInstructions = `The command 'secret-tool' is not installed on this computer.
This tool is required to let Cody manage your access token securely.
To fix this problem, run the commands below and try again:
  sudo apt install libsecret-tools
  sudo apt install gnome-keyring
${alternativelyMessage}`
    async readSecret(): Promise<string> {
        return await this.spawnAsync('secret-tool', [
            'lookup',
            'service',
            this.service(),
            'account',
            this.account.username,
        ])
    }

    override spawnAsync(
        command: string,
        args: string[],
        options?: { stdin: string } | undefined
    ): Promise<string> {
        if (!checkInstalled(this.spinner, command, this.installationInstructions)) {
            return Promise.reject(`command not found: ${command}`)
        }
        return super.spawnAsync(command, args, options)
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
            this.service(),
            'account',
            this.account.username,
        ])
    }
}

const availableCommands = new Map<string, boolean>()
function checkInstalled(spinner: Ora, command: string, installationInstructions: string): boolean {
    if (process.platform === 'win32') {
        // which doesn't work on Windows
        return true
    }
    const fromCache = availableCommands.get(command)
    if (fromCache !== undefined) {
        return fromCache
    }
    const isInstalled = canSpawnCommand(command)
    availableCommands.set(command, isInstalled)
    if (!isInstalled) {
        spinner.fail(installationInstructions)
    }
    return isInstalled
}
function canSpawnCommand(command: string) {
    try {
        execSync(`which ${command}`, { stdio: 'ignore' })
        return true
    } catch (error) {
        return false
    }
}
