import * as vscode from 'vscode'

import { logDebug } from '../log'

import type { CommandResult } from '../main'
import { executeDefaultCommand, isDefaultChatCommand, isDefaultEditCommand } from './execute'
import type { CommandsProvider } from './services/provider'
import { CommandRunner } from './services/runner'
import type { CodyCommandArgs } from './types'
import { fromSlashCommand } from './utils/common'

import { wrapInActiveSpan } from '@sourcegraph/cody-shared/src/tracing'
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
            this.disposables.push(
                this.provider,
                vscode.window.registerTreeDataProvider(
                    'cody.commands.tree.view',
                    this.provider.treeViewProvider
                )
            )
        }
    }

    /**
     * Executes a Cody command from user input text and command args.
     *
     * Handles prompt building and context fetching for commands.
     */
    public async execute(input: string, args: CodyCommandArgs): Promise<CommandResult | undefined> {
        return wrapInActiveSpan('command.custom', async span => {
            // Split the input by space to extract the command key and additional input (if any)
            const commandSplit = input?.trim().split(' ')
            // The unique key for the command. e.g. test, smell, explain
            // Using fromSlashCommand to support backward compatibility with old slash commands
            const commandKey = fromSlashCommand(commandSplit[0] || input)
            // Additional instruction that will be added to end of prompt in the custom command prompt
            // It's added at execution time to allow dynamic arguments
            // E.g. if the command is `edit replace dash with period`,
            // the additionalInput is `replace dash with period`
            const additionalInstruction = commandKey === input ? '' : commandSplit.slice(1).join(' ')

            // Process default commands
            if (isDefaultChatCommand(commandKey) || isDefaultEditCommand(commandKey)) {
                return executeDefaultCommand(commandKey, additionalInstruction)
            }

            const command = this.provider?.get(commandKey)
            if (!command) {
                logDebug('CommandsController:execute', 'command not found', {
                    verbose: { commandKey },
                })
                return undefined
            }

            span.setAttribute('sampled', true)

            command.prompt = [command.prompt, additionalInstruction].join(' ')?.trim()

            // Add shell output as context if any before passing to the runner
            const shell = command.context?.command
            if (shell) {
                const contextFile = await this.provider?.runShell(shell)
                args.userContextFiles = contextFile
            }

            return new CommandRunner(span, command, args).start()
        })
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
