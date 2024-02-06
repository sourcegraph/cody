import type * as vscode from 'vscode'

import { logDebug } from '../log'

import type { CodyCommandArgs } from './types'
import { CommandRunner } from './services/runner'
import type { CommandsProvider } from './services/provider'
import type { CommandResult } from '../main'
import { executeDefaultCommand, isDefaultChatCommand, isDefaultEditCommand } from './execute'
import { fromSlashCommand } from './utils/common'

/**
 * Handles commands execution with commands from CommandsProvider
 * Provides additional prompt management and execution logic
 */
class CommandsController implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    // Provider of default commands and custom commands
    private provider: CommandsProvider | undefined

    public init(provider?: CommandsProvider) {
        if (provider) {
            this.provider = provider
            this.disposables.push(this.provider)
        }
    }

    /**
     * Executes a Cody command from user input text and command args.
     *
     * Handles prompt building and context fetching for commands.
     */
    public async execute(text: string, args: CodyCommandArgs): Promise<CommandResult | undefined> {
        const commandSplit = text?.trim().split(' ')
        // The unique key for the command. e.g. /test
        const commandKey = commandSplit?.shift() || text
        const command = this.provider?.get(fromSlashCommand(commandKey))

        // Additional instruction that will be added to end of prompt in the custom command prompt
        // It's added at execution time to allow dynamic arguments
        // E.g. if the command is `/edit replace dash with period`,
        // the additionalInput is `replace dash with period`
        const additionalInstruction = commandKey === text ? '' : commandSplit.slice(1).join(' ')

        // Process default commands
        if (isDefaultChatCommand(commandKey) || isDefaultEditCommand(commandKey)) {
            return executeDefaultCommand(commandKey, additionalInstruction)
        }

        if (!command) {
            logDebug('CommandsController:execute', 'command not found', { verbose: { commandKey } })
            return undefined
        }

        command.prompt = [command.prompt, additionalInstruction].join(' ')?.trim()

        // Add shell output as context if any before passing to the runner
        const shell = command.context?.command
        if (shell) {
            const contextFile = await this.provider?.runShell(shell)
            args.userContextFiles = contextFile
        }

        return new CommandRunner(command, args).start()
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
        logDebug('CommandsController:dispose', 'disposed')
    }
}

/**
 * A aingleton instance of the CommandsController class.
 * Activate on extension activation that will initialize the CommandsProvider.
 */
const controller = new CommandsController()
export const setCommandController = (provider?: CommandsProvider) => controller.init(provider)

/**
 * Binds the execute method of the CommandsController instance to be exported as a constant function.
 * This allows the execute method to be called without needing a reference to the controller instance.
 */
export const executeCodyCommand = controller.execute.bind(controller)
