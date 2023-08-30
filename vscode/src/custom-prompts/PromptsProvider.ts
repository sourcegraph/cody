import { CodyPrompt, getDefaultCommandsMap } from '@sourcegraph/cody-shared/src/chat/prompts'

import { debug } from '../log'

// Manage default commands created by the prompts in prompts.json
const editorCommands: CodyPrompt[] = [{ description: 'Request a Code Edit', prompt: '/edit', slashCommand: '/edit' }]
export class PromptsProvider {
    // The default prompts
    private defaultPromptsMap = getDefaultCommandsMap(editorCommands)

    // The commands grouped by default prompts and custom prompts
    private allCommands = new Map<string, CodyPrompt>()

    constructor() {
        // add the default prompts to the all commands map
        this.groupCommands(this.defaultPromptsMap)
    }

    /**
     * Find a prompt by its id
     */
    public get(id: string): CodyPrompt | undefined {
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
        debug('CommandsController:dispose', 'disposed')
    }
}
