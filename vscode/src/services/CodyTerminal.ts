import * as vscode from 'vscode'

const BUTTON = {
    run: 'Confirm and run',
    skip: 'Do not ask again',
}

const WARNING = {
    untrusted: 'Terminal commands are disabled in untrusted workspaces.',
}

export class CodyTerminal implements vscode.Disposable {
    public static readonly title = 'Cody by Sourcegraph'
    private codyTerminal: vscode.Terminal | undefined
    private disposables: vscode.Disposable[] = []

    constructor() {
        this.disposables.push(
            vscode.commands.registerCommand('cody.terminal.execute', c => this.run(c.trim()))
        )
    }

    /**
     * Whether to skip the confirmation dialog when running a command.
     * NOTE: This gets reset on editor reload.
     */
    private skipConfirmationOnRun = false

    private run(command: string): void {
        if (!vscode.workspace.isTrusted) {
            vscode.window.showErrorMessage(WARNING.untrusted)
            throw new Error(WARNING.untrusted)
        }

        if (this.skipConfirmationOnRun) {
            this.send(command)
            return
        }

        vscode.window.showInformationMessage(command, BUTTON.run, BUTTON.skip).then(selected => {
            if (selected === BUTTON.skip) {
                this.skipConfirmationOnRun = true
            }

            if (selected) {
                // Try not to run multiline commands automatically to allow user a chance to review it,
                // it does not always work however.
                this.send(command, !isMultiLine(command))
            }
        })
    }

    /**
     * Sends the specified command to the Cody terminal and optionally executes it.
     *
     * This method ensures that the command is only executed in trusted workspaces to
     * prevent potential security risks.
     *
     * @param command The command to send to the Cody terminal.
     * @param execute Whether to execute the command immediately. If false, the command
     * will be sent to the terminal but not executed.
     */
    private send(command: string, execute = true): void {
        // 🚨 SECURITY: Only allow running commands in trusted workspaces.
        if (vscode.workspace.isTrusted) {
            this.terminal.sendText(command.trim(), execute)
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

function isMultiLine(command: string): boolean {
    return /[\r\n]/.test(command)
}
