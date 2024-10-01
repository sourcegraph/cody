import type * as vscode from 'vscode'

import { logDebug } from '../log'

import type { CommandResult } from '../CommandResult'
import { executeDefaultCommand, isDefaultChatCommand, isDefaultEditCommand } from './execute'
import type { CommandsProvider } from './services/provider'
import { CommandRunner } from './services/runner'
import type { CodyCommandArgs } from './types'
import { fromSlashCommand } from './utils/common'

import {
    type CodyCommand,
    DefaultChatCommands,
    type DefaultCodyCommands,
    DefaultEditCommands,
    PromptString,
    ps,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import type { ClientCapabilities } from '../jsonrpc/agent-protocol'
/**
 * Handles commands execution with commands from CommandsProvider
 * Provides additional prompt management and execution logic
 */
class CommandsController implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    // Provider of default commands and custom commands
    private provider: CommandsProvider | undefined

    private isEditEnabled = true

    public init(provider?: CommandsProvider, filter?: Pick<Partial<ClientCapabilities>, 'edit'>) {
        if (provider) {
            this.provider = provider
            this.disposables.push(this.provider)
        }
        // Only set it as disable if the edit capability is set to none.
        this.isEditEnabled = filter?.edit !== 'none'
    }

    public getCommandList(): CodyCommand[] {
        // Remove all edit commands if edit is disabled
        return (this.provider?.list() ?? []).filter(c => c.mode !== 'edit' || this.isEditEnabled)
    }

    /**
     * Executes a Cody command from user input text and command args.
     *
     * Handles prompt building and context fetching for commands.
     */
    public async execute(
        input: DefaultCodyCommands | PromptString,
        args: CodyCommandArgs
    ): Promise<CommandResult | undefined> {
        const promptStringInput = convertDefaultCommandsToPromptString(input)

        return wrapInActiveSpan('command.custom', async span => {
            // Split the input by space to extract the command key and additional input (if any)
            const commandSplit = promptStringInput?.trim().split(' ')
            // The unique key for the command. e.g. test, smell, explain
            // Using fromSlashCommand to support backward compatibility with old slash commands
            const commandKey = fromSlashCommand(commandSplit[0]?.toString() || input?.toString())
            // Additional instruction that will be added to end of prompt in the custom command prompt
            // It's added at execution time to allow dynamic arguments
            // E.g. if the command is `edit replace dash with period`,
            // the additionalInput is `replace dash with period`
            const additionalInstruction =
                commandKey === input.toString() ? ps`` : PromptString.join(commandSplit.slice(1), ps` `)

            if (isDefaultEditCommand(commandKey) && !this.isEditEnabled) {
                throw new Error('Edit commands are not supported in this instance.')
            }

            // Process default commands
            if (isDefaultChatCommand(commandKey) || isDefaultEditCommand(commandKey)) {
                return executeDefaultCommand(commandKey, additionalInstruction)
            }

            const command = this.provider?.get(commandKey)
            if (!command || (command.mode !== 'ask' && !this.isEditEnabled)) {
                logDebug('CommandsController:execute', `${commandKey} command not found/supported`)
                return undefined
            }

            span.setAttribute('sampled', true)

            command.prompt = [command.prompt, additionalInstruction].join(' ')?.trim()

            // Add shell output as context if any before passing to the runner
            if (command.context?.command) {
                args.userContextFiles = await this.provider?.runShell(command.context.command)
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
 * A singleton instance of the CommandsController class.
 * Activate on extension activation that will initialize the CommandsProvider.
 */
const controller = new CommandsController()
export const commandControllerInit = (provider?: CommandsProvider, caps?: ClientCapabilities) =>
    controller.init(provider, caps)

/**
 * Binds the execute method of the CommandsController instance to be exported as a constant function.
 * This allows the execute method to be called without needing a reference to the controller instance.
 */
export const executeCodyCommand = controller.execute.bind(controller)
export const getCodyCommandList = controller.getCommandList.bind(controller)

function convertDefaultCommandsToPromptString(input: DefaultCodyCommands | PromptString): PromptString {
    switch (input) {
        case DefaultChatCommands.Explain:
            return ps`explain`
        case DefaultChatCommands.Smell:
            return ps`smell`
        case DefaultChatCommands.Unit:
            return ps`unit`
        case DefaultEditCommands.Test:
            return ps`test`
        case DefaultChatCommands.Doc:
        case DefaultEditCommands.Doc:
            return ps`doc`
        case DefaultEditCommands.Edit:
            return ps`edit`
        case DefaultEditCommands.Custom:
        case DefaultChatCommands.Custom:
            return ps`custom`
        default:
            return input
    }
}
