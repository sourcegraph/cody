import type { CommandMenuItem } from '../types'

export const ASK_QUESTION_COMMAND = {
    description: 'Ask a question',
    slashCommand: '/ask',
    require,
}

export const EDIT_COMMAND = {
    description: 'Edit code',
    slashCommand: '/edit',
}

// Common Menu Options
const chatOption: CommandMenuItem = {
    label: ASK_QUESTION_COMMAND.slashCommand,
    description: ASK_QUESTION_COMMAND.description,
    slashCommand: ASK_QUESTION_COMMAND.slashCommand,
    alwaysShow: true,
}

const fixOption: CommandMenuItem = {
    label: EDIT_COMMAND.slashCommand,
    description: EDIT_COMMAND.description,
    slashCommand: EDIT_COMMAND.slashCommand,
    alwaysShow: true,
}

const configOption: CommandMenuItem = {
    label: 'Configure Custom Commands...',
    description: 'Manage your custom reusable commands',
    slashCommand: '',
}
const addOption: CommandMenuItem = {
    label: 'New Custom Command...',
    alwaysShow: true,
    description: 'Create a new reusable command',
    slashCommand: '',
    command: 'cody.commands.add',
}

export const CommandMenuOption = {
    chat: chatOption,
    edit: fixOption,
    config: configOption,
    add: addOption,
}
