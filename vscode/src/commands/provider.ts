import type { CodyCommand } from '@sourcegraph/cody-shared'

import type * as vscode from 'vscode'
import { getDefaultCommandsMap } from '.'
import { EDIT_COMMAND } from './menus/utils'
import { CustomCommandsStore } from './custom-commands/store'

const editorCommands: CodyCommand[] = [
    {
        description: EDIT_COMMAND.description,
        prompt: EDIT_COMMAND.slashCommand,
        slashCommand: EDIT_COMMAND.slashCommand,
    },
]

export const vscodeDefaultCommands = getDefaultCommandsMap(editorCommands)

export class CommandsProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    protected readonly defaultCommands = vscodeDefaultCommands
    private customCommandsProvider = new CustomCommandsStore()

    // The commands grouped by default commands and custom commands
    private allCommands = new Map<string, CodyCommand>()

    constructor() {
        this.disposables.push(this.customCommandsProvider)
        // adds the default commands to the all commands map
        this.groupCommands(this.defaultCommands)
    }

    /**
     * Find a command by its id
     */
    public get(id: string): CodyCommand | undefined {
        return this.allCommands.get(id)
    }

    public async getCustomCommands(): Promise<Map<string, CodyCommand>> {
        const { commands } = await this.customCommandsProvider.refresh()
        this.groupCommands(commands)
        return commands
    }

    /**
     * Return default and custom commands without the separator which is added for quick pick menu
     */
    public async getGroupedCommands(keepSeparator: boolean): Promise<[string, CodyCommand][]> {
        await this.refresh()

        if (keepSeparator) {
            return [...this.allCommands]
        }
        return [...this.allCommands].filter(command => command[1].prompt !== 'separator')
    }

    /**
     * Group the default commands with the custom commands and add a separator
     */
    private groupCommands(customCommands = new Map<string, CodyCommand>()): void {
        // Filter commands that has the experimental type if not enabled
        const defaultCommands = [...this.defaultCommands]
        // Add a separator between the default and custom commands
        const combinedMap = new Map([...defaultCommands])
        combinedMap.set('separator', { prompt: 'separator', slashCommand: '' })
        // Add the custom commands to the all commands map
        this.allCommands = new Map([...customCommands, ...combinedMap].sort())
    }

    private async refresh(): Promise<void> {
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
