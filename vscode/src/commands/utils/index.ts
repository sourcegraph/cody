import { type QuickPickItem } from 'vscode'

import { type CodyCommandType, type CustomCommandType } from '@sourcegraph/cody-shared/src/commands'

export type CustomCommandMenuAction = 'add' | 'file' | 'delete' | 'list' | 'open' | 'cancel' | 'docs' | 'back'

export interface CustomCommandMenuAnswer {
    actionID: CustomCommandMenuAction
    commandType: CodyCommandType
}

export interface UserWorkspaceInfo {
    homeDir: string
    workspaceRoot?: string
    currentFilePath?: string
    appRoot: string
}

export interface CustomCommandsItem extends QuickPickItem {
    id?: CustomCommandMenuAction
    type: CustomCommandType
}

export interface ContextOption {
    id: string
    label: string
    detail: string
    picked: boolean
    description?: string
}
