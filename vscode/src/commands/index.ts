import { type CodyCommandMode, isMacOS } from '@sourcegraph/cody-shared'

const osIcon = isMacOS() ? '⌥' : 'Alt+'

interface MenuCommandAccessor {
    key: string
    description: string
    icon: string
    command: { command: string }
    keybinding: string
    prompt?: string
    mode?: CodyCommandMode
    contextValue?: string
    requires?: { setting: string }
}

export const CodyCommandMenuItems: MenuCommandAccessor[] = [
    {
        key: 'ask',
        description: 'New Chat',
        prompt: 'Start a new chat',
        icon: 'comment',
        command: { command: 'cody.chat.panel.new' },
        keybinding: `${osIcon}L`,
        mode: 'ask',
    },
    {
        key: 'edit',
        description: 'Edit Code',
        prompt: 'Start a code edit',
        icon: 'wand',
        command: { command: 'cody.command.edit-code' },
        keybinding: `${osIcon}K`,
        mode: 'edit',
    },
    {
        key: 'doc',
        description: 'Document Code',
        icon: 'book',
        command: { command: 'cody.command.document-code' },
        keybinding: `${osIcon}D`,
        mode: 'edit',
    },
    {
        key: 'explain',
        description: 'Explain Code',
        icon: 'file-binary',
        command: { command: 'cody.command.explain-code' },
        keybinding: '',
        mode: 'ask',
    },
    {
        key: 'test',
        description: 'Generate Unit Tests',
        icon: 'package',
        command: { command: 'cody.command.unit-tests' },
        keybinding: '',
        mode: 'edit',
    },
    {
        key: 'smell',
        description: 'Find Code Smells',
        icon: 'checklist',
        command: { command: 'cody.command.smell-code' },
        keybinding: '',
        mode: 'ask',
    },
    {
        key: 'search',
        prompt: 'Start a new natural language search',
        description: 'Search Code (Beta)',
        icon: 'search',
        command: { command: 'cody.symf.search' },
        keybinding: '',
    },
    {
        key: 'commit',
        description: 'Generate Commit Message (Experimental)',
        icon: 'git-commit',
        command: { command: 'cody.command.generate-commit' },
        keybinding: '',
        requires: { setting: 'cody.experimental.commitMessage' },
    },
    {
        key: 'custom',
        description: 'Custom Commands',
        icon: 'tools',
        command: { command: 'cody.menu.custom-commands' },
        keybinding: `${osIcon}⇧C`,
        contextValue: 'cody.sidebar.custom-commands',
    },
]
