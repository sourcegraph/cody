import { CodyPrompt, getDefaultCommandsMap } from '@sourcegraph/cody-shared/src/chat/prompts'

import { logDebug } from '../log'

// Manage default commands created by the prompts in prompts.json
const editorCommands = [{ name: 'Request a Code Edit', prompt: '/edit', slashCommand: '/edit' }]
const gitCommands = [{ name: 'Git', prompt: '/git', slashCommand: '/git' }]
export class PromptsProvider {
    // The default prompts
    private defaultPromptsMap = getDefaultCommandsMap([...editorCommands, ...gitCommands])

    // The commands grouped by default prompts and custom prompts
    private allCommands = new Map<string, CodyPrompt>()

    constructor() {
        // add the default prompts to the all commands map
        this.groupCommands(this.defaultPromptsMap)
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
     * Return default and custom commands without the separator which is added for quick pick menu
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
    public groupCommands(customCommands = new Map<string, CodyPrompt>()): void {
        const combinedMap = new Map([...this.defaultPromptsMap])
        combinedMap.set('separator', { prompt: 'separator' })
        this.allCommands = new Map([...combinedMap, ...customCommands])
    }

    // dispose and reset the controller and builder
    public dispose(): void {
        this.allCommands = new Map()
        logDebug('CommandsController:dispose', 'disposed')
    }
}
