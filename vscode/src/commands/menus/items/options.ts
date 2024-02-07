import type { CommandMenuItem } from '../types'

export const ASK_QUESTION_COMMAND = {
    description: 'Ask a question',
    key: 'ask',
}

export const EDIT_COMMAND = {
    description: 'Edit code',
    key: 'edit',
}

// Common Menu Options
const chatOption: CommandMenuItem = {
    label: ASK_QUESTION_COMMAND.key,
    description: ASK_QUESTION_COMMAND.description,
    commandKey: ASK_QUESTION_COMMAND.key,
    alwaysShow: true,
}

const fixOption: CommandMenuItem = {
    label: EDIT_COMMAND.key,
    description: EDIT_COMMAND.description,
    commandKey: EDIT_COMMAND.key,
    alwaysShow: true,
}

const configOption: CommandMenuItem = {
    label: 'Configure Custom Commands...',
    description: 'Manage your custom reusable commands',
    commandKey: '',
}
const addOption: CommandMenuItem = {
    label: 'New Custom Command...',
    alwaysShow: true,
    description: 'Create a new reusable command',
    commandKey: '',
    command: 'cody.commands.add',
}

export const CommandMenuOption = {
    chat: chatOption,
    edit: fixOption,
    config: configOption,
    add: addOption,
}
