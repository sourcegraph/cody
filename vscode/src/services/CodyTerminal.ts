import * as vscode from 'vscode'

export class CodyTerminal implements vscode.Disposable {
    public static readonly title = 'Cody by Sourcegraph'
    private codyTerminal: vscode.Terminal | undefined
    private disposables: vscode.Disposable[] = []

    constructor() {
        this.disposables.push(
            vscode.commands.registerCommand('cody.terminal.execute', (cmd: string) => this.run(cmd))
        )
    }

    /**
     * Whether to skip the confirmation dialog when running a command.
     * NOTE: This gets reset on editor reload.
     */
    private skipConfirmationOnRun = false

    private run(command: string): void {
        if (!vscode.workspace.isTrusted) {
            const WARNING = 'Commands are disabled in untrusted workspaces.'
            vscode.window.showErrorMessage(WARNING)
            throw new Error(WARNING)
        }

        if (this.skipConfirmationOnRun) {
            this.send(command)
            return
        }
        const BUTTON = {
            confirm: 'Yes',
            skip: 'Do not ask again',
        }
        vscode.window
            .showInformationMessage(`Run \`${command}\` in the terminal?`, BUTTON.confirm, BUTTON.skip)
            .then(selected => {
                if (selected === BUTTON.skip) {
                    this.skipConfirmationOnRun = true
                }
                if (selected) {
                    this.send(command)
                }
            })
    }

    private send(command: string): void {
        // 🚨 SECURITY: Only allow running commands in trusted workspaces.
        if (vscode.workspace.isTrusted) {
            this.terminal.sendText(command)
            this.terminal.show()
        }
    }

    private get terminal(): vscode.Terminal {
        const active = vscode.window.activeTerminal

        // Use the active terminal if available and not created by other extensions.
        // NOTE: Terminals created by user do not have a creationOptions.name set.
        if (active && !active.creationOptions?.name) {
            return active
        }

        // Return existing Cody terminal or create a new one.
        return this.codyTerminal ?? this.createCodyTerminal()
    }

    private createCodyTerminal(): vscode.Terminal {
        this.codyTerminal = vscode.window.createTerminal({
            name: CodyTerminal.title,
            hideFromUser: true,
            iconPath: new vscode.ThemeIcon('cody-logo-heavy'),
            isTransient: true,
        })
        // Handle terminal closure.
        const closeHandler = vscode.window.onDidCloseTerminal((t: vscode.Terminal) => {
            if (t.name === CodyTerminal.title) {
                this.codyTerminal = undefined
                const index = this.disposables.indexOf(closeHandler)
                if (index > -1) {
                    this.disposables.splice(index, 1)
                }
            }
        })
        this.disposables.push(this.codyTerminal, closeHandler)
        return this.codyTerminal
    }

    public dispose(): void {
        for (const disposable of [...this.disposables]) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
