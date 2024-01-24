import type { CodyCommand } from '@sourcegraph/cody-shared'

import * as vscode from 'vscode'
import { getDefaultCommandsMap } from '.'
import { EDIT_COMMAND } from './menus/const'
import { CustomCommandsProvider } from './custom-commands/provider'
import { showCommandMenu } from './menus'
const editorCommands: CodyCommand[] = [
    {
        description: EDIT_COMMAND.description,
        prompt: EDIT_COMMAND.slashCommand,
        slashCommand: EDIT_COMMAND.slashCommand,
        mode: 'edit',
    },
]

export const vscodeDefaultCommands = getDefaultCommandsMap(editorCommands)

export class CommandsManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    protected readonly defaultCommands = vscodeDefaultCommands
    protected customCommandsProvider = new CustomCommandsProvider()

    // The commands grouped by default commands and custom commands
    private allCommands = new Map<string, CodyCommand>()

    constructor() {
        this.disposables.push(this.customCommandsProvider)
        // adds the default commands to the all commands map
        this.groupCommands(this.defaultCommands)

        // Cody Command Menus
        this.disposables.push(
            vscode.commands.registerCommand('cody.menu.commands', () => this?.menu('default')),
            vscode.commands.registerCommand('cody.menu.custom-commands', () => this?.menu('custom')),
            vscode.commands.registerCommand('cody.menu.commands-settings', () => this?.menu('config'))
        )
    }

    /**
     * Find a command by its id
     */
    public get(id: string): CodyCommand | undefined {
        return this.allCommands.get(id)
    }

    private async menu(type: 'custom' | 'config' | 'default'): Promise<void> {
        const customCommands = await this.getCustomCommands()
        const commandArray = [...customCommands].map(command => command[1])
        await showCommandMenu(type, commandArray)
    }

    protected async getCustomCommands(): Promise<Map<string, CodyCommand>> {
        const { commands } = await this.customCommandsProvider.refresh()
        this.groupCommands(commands)
        return commands
    }

    /**
     * Group the default commands with the custom commands and add a separator
     */
    protected groupCommands(customCommands = new Map<string, CodyCommand>()): void {
        const defaultCommands = [...this.defaultCommands]
        const combinedMap = new Map([...defaultCommands])
        // Add the custom commands to the all commands map
        this.allCommands = new Map([...customCommands, ...combinedMap].sort())
    }

    protected async refresh(): Promise<void> {
        const { commands } = await this.customCommandsProvider.refresh()
        this.groupCommands(commands)
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
