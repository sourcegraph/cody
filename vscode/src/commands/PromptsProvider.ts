import { type CodyCommand } from '@sourcegraph/cody-shared/src/commands'

import { getDefaultCommandsMap } from '.'
import { ASK_QUESTION_COMMAND, EDIT_COMMAND } from './utils/menu'

// Manage default commands created by the prompts in prompts.json
const editorCommands: CodyCommand[] = [
    {
        description: ASK_QUESTION_COMMAND.description,
        prompt: ASK_QUESTION_COMMAND.slashCommand,
        slashCommand: ASK_QUESTION_COMMAND.slashCommand,
    },
    {
        description: EDIT_COMMAND.description,
        prompt: EDIT_COMMAND.slashCommand,
        slashCommand: EDIT_COMMAND.slashCommand,
    },
]

export class PromptsProvider {
    // The default prompts
    private defaultPromptsMap

    // The commands grouped by default prompts and custom prompts
    private allCommands = new Map<string, CodyCommand>()

    constructor(includeExperimentalCommands: boolean) {
        // Filter commands that has the experimental type
        this.defaultPromptsMap = getDefaultCommandsMap(editorCommands)
        // add the default prompts to the all commands map
        this.groupCommands(this.defaultPromptsMap, includeExperimentalCommands)
    }

    /**
     * Find a prompt by its id
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
     * Group the default prompts with the custom prompts and add a separator
     */
    public groupCommands(customCommands = new Map<string, CodyCommand>(), includeExperimentalCommands = false): void {
        let defaultCommands = [...this.defaultPromptsMap]
        if (!includeExperimentalCommands) {
            defaultCommands = defaultCommands.filter(command => command[1].type !== 'experimental')
        }
        const combinedMap = new Map([...defaultCommands])
        combinedMap.set('separator', { prompt: 'separator', slashCommand: '' })
        this.allCommands = new Map([...customCommands, ...combinedMap].sort())
    }
}
