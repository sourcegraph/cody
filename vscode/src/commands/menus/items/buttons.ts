import { type QuickInputButton, QuickInputButtons, ThemeIcon } from 'vscode'
import { CommandMenuAction } from '../types'

const openIconButton = {
    iconPath: new ThemeIcon('go-to-file'),
    tooltip: 'Open or Create Settings File',
    id: CommandMenuAction.Open,
    command: 'cody.commands.open.json',
}

const trashIconButton: CommandMenuButton = {
    iconPath: new ThemeIcon('trash'),
    tooltip: 'Delete Settings File',
    id: CommandMenuAction.Delete,
    command: 'cody.commands.delete.json',
}

const gearIconButton: CommandMenuButton = {
    iconPath: new ThemeIcon('gear'),
    tooltip: 'Configure Custom Commands...',
    id: CommandMenuAction.Config,
}

const backIconButton = QuickInputButtons.Back

export const CommandMenuButtons = {
    open: openIconButton,
    trash: trashIconButton,
    back: backIconButton,
    gear: gearIconButton,
}

export interface CommandMenuButton extends QuickInputButton {
    command?: string
    id?: CommandMenuAction
}
