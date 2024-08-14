import {
    type CodyCommand,
    CodyIDE,
    type ContextItem,
    CustomCommandType,
    isFileURI,
} from '@sourcegraph/cody-shared'

import * as vscode from 'vscode'
import { CodyCommandMenuItems } from '..'
import { getConfiguration } from '../../configuration'
import { executeExplainHistoryCommand } from '../execute/explain-history'
import { showCommandMenu } from '../menus'
import type { CodyCommandArgs } from '../types'
import { CustomCommandsManager, openCustomCommandDocsLink } from './custom-commands'

const vscodeDefaultCommands: CodyCommand[] = CodyCommandMenuItems.filter(
    ({ isBuiltin }) => isBuiltin === true
).map(
    c =>
        ({
            key: c.key,
            description: c.description,
            prompt: c.prompt ?? '',
            type: c.isBuiltin ? 'default' : 'experimental',
            mode: c.mode,
        }) satisfies CodyCommand
)

/**
 * Provides management and interaction capabilities for both default and custom Cody commands.
 *
 * It is responsible for initializing, grouping, and refreshing command sets,
 * as well as handling command menus and execution.
 */
export class CommandsProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    protected readonly commands = new Map<string, CodyCommand>()
    protected customCommandsStore = new CustomCommandsManager()

    constructor() {
        this.disposables.push(this.customCommandsStore)

        if (getConfiguration().agentIDE !== CodyIDE.Web) {
            for (const c of vscodeDefaultCommands) {
                this.commands.set(c.key, c)
            }
        }

        // Cody Command Menus
        this.disposables.push(
            vscode.commands.registerCommand('cody.menu.commands', a => this?.menu('default', a)),
            vscode.commands.registerCommand('cody.menu.custom-commands', a => this?.menu('custom', a)),
            vscode.commands.registerCommand('cody.menu.commands-settings', a => this?.menu('config', a)),
            vscode.commands.registerCommand('cody.commands.open.doc', () => openCustomCommandDocsLink())
        )

        this.disposables.push(
            vscode.commands.registerCommand('cody.command.explain-history', a =>
                executeExplainHistoryCommand(this, a)
            )
        )

        this.customCommandsStore.init()
        void this.customCommandsStore.refresh()
    }

    private async menu(type: 'custom' | 'config' | 'default', args?: CodyCommandArgs): Promise<void> {
        const commandArray = this.list().filter(
            c =>
                type !== 'custom' ||
                c.type === CustomCommandType.User ||
                c.type === CustomCommandType.Workspace
        )
        if (type === 'custom' && !commandArray.length) {
            return showCommandMenu('config', commandArray, args)
        }

        await showCommandMenu(type, commandArray, args)
    }

    public list(): CodyCommand[] {
        return [...this.customCommandsStore.commands.values(), ...this.commands.values()]
    }

    /**
     * Find a command by its id
     */
    public get(id: string): CodyCommand | undefined {
        return this.commands.get(id) ?? this.customCommandsStore.commands.get(id)
    }

    /**
     * Gets the context file content from executing a shell command.
     * Used for retreiving context for the command field in custom command
     */
    public async runShell(shell: string): Promise<ContextItem[]> {
        const { getContextFileFromShell } = await import('../context/shell')
        return getContextFileFromShell(shell)
    }

    /**
     * History returns the context for how a file changed. Locally this is
     * implemented as git log.
     */
    public async history(
        uri: vscode.Uri,
        options: {
            /**
             * Uses git log's -L:<funcname>:<file> traces the evolution of the
             * function name regex <funcname>, within the <file>. This relies on
             * reasonable heuristics built into git to find function bodies.
             * However, the heuristics often fail so we should switch to computing
             * the line region ourselves.
             * https://git-scm.com/docs/git-log#Documentation/git-log.txt--Lltfuncnamegtltfilegt
             */
            funcname: string
            /**
             * Limit the amount of commits to maxCount.
             */
            maxCount: number
        }
    ): Promise<ContextItem[]> {
        if (!isFileURI(uri)) {
            throw new Error('history only supported on local file paths')
        }
        const { getContextFileFromGitLog } = await import('../context/git-log')
        return getContextFileFromGitLog(uri, options)
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
