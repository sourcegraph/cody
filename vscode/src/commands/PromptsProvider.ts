import type { CodyCommand } from '@sourcegraph/cody-shared'

import { getDefaultCommandsMap } from '.'
import { EDIT_COMMAND } from './utils/menu'

// Manage default commands created by the prompts in prompts.json
const editorCommands: CodyCommand[] = [
    {
        description: EDIT_COMMAND.description,
        prompt: EDIT_COMMAND.slashCommand,
        slashCommand: EDIT_COMMAND.slashCommand,
    },
]

export const vscodeDefaultCommands = getDefaultCommandsMap(editorCommands)

export class PromptsProvider {
    // The commands grouped by default commands and custom commands
    private allCommands = new Map<string, CodyCommand>()
    private defaultCommands = vscodeDefaultCommands

    constructor() {
        // add the default commands to the all commands map
        this.groupCommands(this.defaultCommands)
    }

    /**
     * Find a command by its id
     */
    public get(id: string): CodyCommand | undefined {
        return this.allCommands.get(id)
    }

    /**
     * Return default and custom commands without the separator which is added for quick pick menu
     */
    public getGroupedCommands(keepSeparator: boolean): [string, CodyCommand][] {
        if (keepSeparator) {
            return [...this.allCommands]
        }
        return [...this.allCommands].filter(command => command[1].prompt !== 'separator')
    }

    /**
     * Group the default commands with the custom commands and add a separator
     */
    public groupCommands(
        customCommands = new Map<string, CodyCommand>(),
        includeExperimentalCommands = false
    ): void {
        // Filter commands that has the experimental type if not enabled
        let defaultCommands = [...this.defaultCommands]
        if (!includeExperimentalCommands) {
            defaultCommands = defaultCommands.filter(command => command[1]?.type !== 'experimental')
        }
        // Add a separator between the default and custom commands
        const combinedMap = new Map([...defaultCommands])
        combinedMap.set('separator', { prompt: 'separator', slashCommand: '' })
        // Add the custom commands to the all commands map
        this.allCommands = new Map([...customCommands, ...combinedMap].sort())
    }
}
