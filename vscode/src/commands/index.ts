import { type CodyCommandMode, isMacOS } from '@sourcegraph/cody-shared'

const osIcon = isMacOS() ? '⌥' : 'Alt+'

export type MenuCommand =
    | 'ask'
    | 'edit'
    | 'doc'
    | 'explain'
    | 'test'
    | 'smell'
    | 'auto'
    | 'commit'
    | 'custom'

export interface MenuCommandAccessor {
    key: MenuCommand
    title: string
    icon: string
    command: string
    keybinding: string
    prompt?: string
    mode?: CodyCommandMode
    contextValue?: string
    requires?: { setting: string }
}

export const CodyCommandMenuItems: MenuCommandAccessor[] = [
    {
        key: 'ask',
        title: 'New Chat',
        prompt: 'Start a new chat',
        icon: 'comment',
        command: 'cody.chat.newEditorPanel',
        keybinding: `${osIcon}L`,
        mode: 'ask',
    },
    {
        key: 'edit',
        title: 'Edit Code',
        prompt: 'Start a code edit',
        icon: 'wand',
        command: 'cody.command.edit-code',
        keybinding: `${osIcon}K`,
        mode: 'edit',
    },
    {
        key: 'doc',
        title: 'Document Code',
        icon: 'book',
        command: 'cody.command.document-code',
        keybinding: `${osIcon}D`,
        mode: 'edit',
    },
    {
        key: 'explain',
        title: 'Explain Code',
        icon: 'file-binary',
        command: 'cody.command.explain-code',
        keybinding: '',
        mode: 'ask',
    },
    {
        key: 'test',
        title: 'Generate Unit Tests',
        icon: 'package',
        command: 'cody.command.unit-tests',
        keybinding: '',
        mode: 'edit',
    },
    {
        key: 'smell',
        title: 'Find Code Smells',
        icon: 'checklist',
        command: 'cody.command.smell-code',
        keybinding: '',
        mode: 'ask',
    },
    {
        key: 'auto',
        title: 'Auto Edit (Experimental)',
        icon: 'surround-with',
        command: 'cody.command.auto-edit',
        keybinding: `${osIcon}Tab`,
        requires: { setting: 'cody.internal.unstable' },
    },
    {
        key: 'commit',
        title: 'Generate Commit Message (Experimental)',
        icon: 'git-commit',
        command: 'cody.command.generate-commit',
        keybinding: '',
        requires: { setting: 'cody.experimental.commitMessage' },
    },
    {
        key: 'custom',
        title: 'Custom Commands',
        icon: 'tools',
        command: 'cody.menu.custom-commands',
        keybinding: `${osIcon}⇧C`,
        contextValue: 'cody.sidebar.custom-commands',
    },
]
