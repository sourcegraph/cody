import type { QuickPickItem } from 'vscode'

import type { CodyCommandType } from '@sourcegraph/cody-shared/src/commands/types'

export enum CommandMenuAction {
    Add = 'add',
    File = 'file',
    Delete = 'delete',
    List = 'list',
    Open = 'open',
    Cancel = 'cancel',
    Docs = 'docs',
    Back = 'back',
    Command = 'command',
    Config = 'config',
}

export interface CommandMenuItem extends QuickPickItem {
    id?: CommandMenuAction
    type?: CodyCommandType
    // vs code command, e.g. 'cody.commands.open.json'
    command?: string
    /**
     * cody command, e.g. '/ask'
     * @deprecated Use 'commandKey' instead.
     */
    slashCommand?: string
    /**
     * key of the command, e.g. 'smell' for Code Smell
     */
    key?: string
}

export interface ContextOption {
    id: string
    label: string
    detail: string
    picked: boolean
    description?: string
}

export enum CustomCommandConfigFile {
    User = '~/.vscode/cody.json',
    Workspace = '.vscode/cody.json',
}
