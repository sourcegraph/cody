import type * as vscode from 'vscode'

import { logDebug } from '../log'

import type { CodyCommandArgs } from '.'
import { CommandRunner } from './CommandRunner'
import type { CommandsManager } from './manager'
import type { ChatSession } from '../chat/chat-view/SimpleChatPanelProvider'

/**
 * Handles commands execution with commands from CommandsManager
 * Provides additional prompt management and execution logic
 */
class CommandsController implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private provider: CommandsManager | undefined

    public init(provider?: CommandsManager) {
        if (provider) {
            this.provider = provider
            this.disposables.push(this.provider)
        }
    }

    /**
     * Executes a Cody command from user input text and command args.
     */
    public async execute(text: string, args: CodyCommandArgs): Promise<ChatSession | undefined> {
        const commandSplit = text.split(' ')
        // The unique key for the command. e.g. /test
        const commandKey = commandSplit.shift() || text
        const command = this.provider?.get(commandKey)
        if (!command) {
            return
        }

        // Additional instruction that will be added to end of prompt in the custom command prompt
        command.additionalInput = commandKey === text ? '' : commandSplit.join(' ')

        // Add shell output as context if needed
        const shell = command.context?.command
        if (shell) {
            const contextFile = await this.provider?.runShell(shell)
            args.userContextFiles = contextFile
        }

        return await new CommandRunner(command, args).start()
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
        logDebug('CommandsController:dispose', 'disposed')
    }
}

const controller = new CommandsController()

export const setCommandController = (provider?: CommandsManager) => controller.init(provider)

export const executeCodyCommand = controller.execute.bind(controller)
