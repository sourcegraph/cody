import { CustomCommandType } from '@sourcegraph/cody-shared/src/commands/types'
import {
    CommandMenuAction,
    type CommandMenuItem,
    type ContextOption,
    CustomCommandConfigFile,
} from '../types'
import { type CommandMenuButton, CommandMenuButtons } from './buttons'

import { platform } from 'os'

export { CommandMenuButton } from './buttons'
export { CommandMenuSeperator } from './seperators'
export { CommandMenuOption } from './options'

export const CommandMenuTitleItem = {
    default: {
        title: `Cody Commands (Shortcut: ${platform() === 'darwin' ? '⌥' : 'Alt+'}C)`,
        placeHolder: 'Search for a command or enter your question here...',
        buttons: [CommandMenuButtons.gear] as CommandMenuButton[],
    },
    custom: {
        title: 'Cody: Custom Commands (Beta)',
        placeHolder: 'Search command to run...',
        buttons: [CommandMenuButtons.back, CommandMenuButtons.gear] as CommandMenuButton[],
    },
    config: {
        title: 'Cody: Configure Custom Commands (Beta)',
        placeHolder: 'Choose an option',
        buttons: [CommandMenuButtons.back] as CommandMenuButton[],
    },
}

export const CustomCommandConfigMenuItems = [
    {
        kind: 0,
        label: 'New Custom Command...',
        id: CommandMenuAction.Add,
        command: 'cody.menu.custom.build',
    },
    { kind: -1, id: 'separator', label: '' },
    {
        kind: 0,
        label: 'Open User Settings (JSON)',
        detail: 'Stored on your machine and usable across all your workspaces/repositories',
        id: CommandMenuAction.Open,
        type: CustomCommandType.User,
        description: CustomCommandConfigFile.User,
        buttons: [CommandMenuButtons.open, CommandMenuButtons.trash],
        command: 'cody.commands.open.json',
    },
    {
        kind: 0,
        label: 'Open Workspace Settings (JSON)',
        detail: 'Project-specific and shared with anyone using this workspace/repository',
        id: CommandMenuAction.Open,
        type: CustomCommandType.Workspace,
        description: CustomCommandConfigFile.Workspace,
        buttons: [CommandMenuButtons.open, CommandMenuButtons.trash],
        command: 'cody.commands.open.json',
    },
    { kind: -1, id: 'separator', label: '' },
    {
        kind: 0,
        label: 'Open Custom Commands Documentation',
        id: 'docs',
        type: CustomCommandType.User,
        command: 'cody.commands.open.doc',
    },
] as CommandMenuItem[]

// List of context types to include with the prompt
export const customPromptsContextOptions: ContextOption[] = [
    {
        id: 'selection',
        label: 'Selected Code',
        detail: 'Code currently highlighted in the active editor.',
        picked: true,
    },
    {
        id: 'currentDir',
        label: 'Current Directory',
        detail: 'First 10 text files in the current directory. If the prompt includes the words "test" or "tests", only test files will be included.',
        picked: false,
    },
    {
        id: 'openTabs',
        label: 'Current Open Tabs',
        detail: 'First 10 text files in current open tabs',
        picked: false,
    },
    {
        id: 'command',
        label: 'Command Output',
        detail: 'The output returned from a terminal command (e.g. git describe --long, node your-script.js, cat src/file-name.js)',
        picked: false,
    },
    {
        id: 'none',
        label: 'None',
        detail: 'Exclude all types of context.',
        picked: false,
    },
]
