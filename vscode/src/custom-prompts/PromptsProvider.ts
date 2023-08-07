import { CodyPrompt, getDefaultCommandsMap } from '@sourcegraph/cody-shared/src/chat/prompts'

import { debug } from '../log'

// Manage default commands created by the prompts in prompts.json
export class PromptsProvider {
    // The default prompts
    private defaultPromptsMap = getDefaultCommandsMap()

    // The commands grouped by default prompts and custom prompts
    private allCommands = new Map<string, CodyPrompt>()

    constructor({ includeDefaultCommands }: { includeDefaultCommands?: boolean } = {}) {
        this.groupCommands(this.defaultPromptsMap, includeDefaultCommands)
    }

    /**
     * Find a prompt by its id
     */
    public get(id: string, isSlashCommand = false): CodyPrompt | undefined {
        if (id.startsWith('/') || isSlashCommand) {
            const commands = [...this.allCommands]
            const slashCommand = commands.find(command => command[1].slashCommand === id)
            return slashCommand ? slashCommand[1] : this.allCommands.get(id)
        }

        return this.allCommands.get(id)
    }

    /**
     * Retuen default and custom commands without the separator which is added for quick pick menu
     */
    public getGroupedCommands(keepSeparator: boolean): [string, CodyPrompt][] {
        if (keepSeparator) {
            return [...this.allCommands]
        }
        return [...this.allCommands].filter(command => command[1].prompt !== 'separator')
    }

    /**
     * Group the default prompts with the custom prompts and add a separator
     */
    public groupCommands(customCommands = new Map<string, CodyPrompt>(), includeDefault = true): void {
        if (includeDefault) {
            const combinedMap = new Map([...this.defaultPromptsMap])
            combinedMap.set('separator', { prompt: 'separator' })
            this.allCommands = new Map([...combinedMap, ...customCommands])
            return
        }

        this.allCommands = customCommands
    }

    // dispose and reset the controller and builder
    public dispose(): void {
        this.allCommands = new Map()
        debug('CommandsController:dispose', 'disposed')
    }
}
