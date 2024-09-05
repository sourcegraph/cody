import { spawn } from 'node:child_process'
import type * as vscode from 'vscode'
import { emptyEvent } from '../../vscode/src/testutils/emptyEvent'
import type { MessageHandler } from './jsonrpc-alias'

export class AgentStatelessSecretStorage implements vscode.SecretStorage {
    private readonly inMemorySecretStorageMap = new Map<string, string>()
    public get(key: string): Thenable<string | undefined> {
        return Promise.resolve(this.inMemorySecretStorageMap.get(key))
    }
    public store(key: string, value: string): Thenable<void> {
        this.inMemorySecretStorageMap.set(key, value)
        return Promise.resolve()
    }
    public delete(key: string): Thenable<void> {
        this.inMemorySecretStorageMap.delete(key)
        return Promise.resolve()
    }
    onDidChange: vscode.Event<vscode.SecretStorageChangeEvent> = emptyEvent()
}

export class AgentClientManagedSecretStorage implements vscode.SecretStorage {
    constructor(
        private readonly agent: MessageHandler,
        public readonly onDidChange: vscode.Event<vscode.SecretStorageChangeEvent>
    ) {}
    public async get(key: string): Promise<string | undefined> {
        const result = await this.agent.request('secrets/get', { key })
        return result ?? undefined
    }
    public async store(key: string, value: string): Promise<void> {
        await this.agent.request('secrets/store', { key, value })
    }
    public async delete(key: string): Promise<void> {
        await this.agent.request('secrets/delete', { key })
    }
}

export class AgentServerManagedSecretStorage implements vscode.SecretStorage {
    private readonly platform = process.platform

    constructor(public readonly onDidChange: vscode.Event<vscode.SecretStorageChangeEvent>) {
        if (this.platform === 'win32') {
            this.ensureCredentialManagerInstalled()
        }
    }

    public async get(key: string): Promise<string | undefined> {
        switch (this.platform) {
            case 'darwin':
                return this.spawnAsync('security', [
                    'find-generic-password',
                    '-s',
                    this.service(key),
                    '-a',
                    this.account(key),
                    '-w',
                ])
            case 'win32': {
                const powershellCommand = `
                        $cred = Get-StoredCredential -Target "${this.target(key)}"
                        if ($cred -ne $null) {
                            $cred.GetNetworkCredential().Password
                        } else {
                            ""
                        }
                    `
                return this.spawnAsync('powershell.exe', ['-Command', powershellCommand])
            }
            case 'linux':
                return this.spawnAsync('secret-tool', [
                    'lookup',
                    'service',
                    this.service(key),
                    'account',
                    this.account(key),
                ])
            default:
                throw new Error(`Unsupported platform: ${this.platform}`)
        }
    }

    public async store(key: string, value: string): Promise<void> {
        switch (this.platform) {
            case 'darwin':
                await this.spawnAsync('security', [
                    'add-generic-password',
                    '-s',
                    this.service(key),
                    '-a',
                    this.account(key),
                    '-w',
                    value,
                ])
                break
            case 'win32': {
                const powershellCommand = `
                        $securePassword = ConvertTo-SecureString '${value}' -AsPlainText -Force
                        New-StoredCredential -Target '${this.target(key)}' -UserName 'CodyUser' -SecurePassword $securePassword -Persist LocalMachine
                    `
                await this.spawnAsync('powershell.exe', ['-Command', powershellCommand])
                break
            }
            case 'linux':
                await this.spawnAsync(
                    'secret-tool',
                    [
                        'store',
                        '--label',
                        this.service(key),
                        'service',
                        this.service(key),
                        'account',
                        this.account(key),
                    ],
                    { stdin: value }
                )
                break
            default:
                throw new Error(`Unsupported platform: ${this.platform}`)
        }
    }

    public async delete(key: string): Promise<void> {
        switch (this.platform) {
            case 'darwin':
                await this.spawnAsync('security', [
                    'delete-generic-password',
                    '-s',
                    this.service(key),
                    '-a',
                    this.account(key),
                ])
                break
            case 'win32': {
                const powershellCommand = `
                        $cred = Get-StoredCredential -Target '${this.target(key)}'
                        if ($cred -ne $null) {
                            Remove-StoredCredential -Target '${this.target(key)}'
                        }
                    `
                await this.spawnAsync('powershell.exe', ['-Command', powershellCommand])
                break
            }
            case 'linux':
                await this.spawnAsync('secret-tool', [
                    'clear',
                    'service',
                    this.service(key),
                    'account',
                    this.account(key),
                ])
                break
            default:
                throw new Error(`Unsupported platform: ${this.platform}`)
        }
    }

    private service(key: string): string {
        return `Cody: ${key}`
    }

    private account(key: string): string {
        return `cody_${key}`
    }

    private target(key: string): string {
        return `${this.service(key)}:${this.account(key)}`.replaceAll('"', '_')
    }

    private spawnAsync(command: string, args: string[], options?: { stdin: string }): Promise<string> {
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

    private async ensureCredentialManagerInstalled(): Promise<void> {
        try {
            await this.spawnAsync('powershell.exe', [
                '-Command',
                'if (-not (Get-Module -ListAvailable -Name CredentialManager)) { Install-Module -Name CredentialManager -Force -Scope CurrentUser }',
            ])
        } catch (error) {
            console.error('Failed to install CredentialManager module:', error)
        }
    }
}
