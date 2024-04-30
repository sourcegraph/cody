import { CodyCommandMenuItems } from '../..'
import type { CommandMenuItem } from '../types'

const ASK_QUESTION_COMMAND = CodyCommandMenuItems[0]

const EDIT_COMMAND = CodyCommandMenuItems[1]

// Common Menu Options
const chatOption: CommandMenuItem = {
    label: `$(${ASK_QUESTION_COMMAND.icon}) ${ASK_QUESTION_COMMAND.description}`,
    description: ASK_QUESTION_COMMAND.prompt,
    key: ASK_QUESTION_COMMAND.key,
    alwaysShow: true,
    type: 'default',
    command: ASK_QUESTION_COMMAND.command.command,
}

const fixOption: CommandMenuItem = {
    label: `$(${EDIT_COMMAND.icon}) ${EDIT_COMMAND.description}`,
    description: EDIT_COMMAND.prompt,
    key: EDIT_COMMAND.key,
    alwaysShow: true,
    type: 'default',
    command: ASK_QUESTION_COMMAND.command.command,
}

const configOption: CommandMenuItem = {
    label: '$(gear) Configure Custom Commands...',
    description: 'Manage your custom reusable commands',
    key: '',
    command: 'cody.menu.commands-settings',
}

const addOption: CommandMenuItem = {
    label: '$(diff-added) New Custom Command...',
    alwaysShow: true,
    description: 'Create a new reusable command',
    key: '',
    command: 'cody.menu.custom.build',
}

const searchOption: CommandMenuItem = {
    label: '$(search) Search (Beta)',
    alwaysShow: true,
    description: 'Start a new Natural Language Search',
    key: 'search',
    command: 'cody.symf.search',
}

export const CommandMenuOption = {
    chat: chatOption,
    edit: fixOption,
    config: configOption,
    add: addOption,
    search: searchOption,
}
