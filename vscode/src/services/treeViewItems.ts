import type { FeatureFlag } from '@sourcegraph/cody-shared'

import { releaseType } from '../release'
import { version } from '../version'
import { getIgnoreSidebarItems } from './cody-ignore'

export type CodyTreeItemType = 'command' | 'support' | 'search' | 'chat' | 'ignore'

export interface CodySidebarTreeItem {
    title: string
    icon: string
    id?: string
    description?: string
    command: {
        command: string
        args?: string[] | { [key: string]: string }[]
    }
    isNestedItem?: boolean
    requireFeature?: FeatureFlag
    requireUpgradeAvailable?: boolean
    requireDotCom?: boolean
}

/**
 * Gets the tree view items to display based on the provided type.
 */
export function getCodyTreeItems(type: CodyTreeItemType): CodySidebarTreeItem[] {
    switch (type) {
        case 'command':
            return commandsItems
        case 'support':
            return supportItems
        case 'ignore':
            return getIgnoreSidebarItems()
        default:
            return []
    }
}

const supportItems: CodySidebarTreeItem[] = [
    {
        title: 'Upgrade',
        description: 'Upgrade to Pro',
        icon: 'zap',
        command: { command: 'cody.show-page', args: ['upgrade'] },
        requireDotCom: true,
        requireUpgradeAvailable: true,
    },
    {
        title: 'Usage',
        icon: 'pulse',
        command: { command: 'cody.show-page', args: ['usage'] },
        requireDotCom: true,
    },
    {
        title: 'Settings',
        icon: 'settings-gear',
        command: { command: 'cody.sidebar.settings' },
    },
    {
        title: 'Keyboard Shortcuts',
        icon: 'keyboard',
        command: { command: 'cody.sidebar.keyboardShortcuts' },
    },
    {
        title: `${releaseType(version) === 'stable' ? 'Release' : 'Pre-Release'} Notes`,
        description: `v${version}`,
        icon: 'github',
        command: { command: 'cody.sidebar.releaseNotes' },
    },
    {
        title: 'Documentation',
        icon: 'book',
        command: { command: 'cody.sidebar.documentation' },
    },
    {
        title: 'Feedback',
        icon: 'feedback',
        command: { command: 'cody.sidebar.feedback' },
    },
    {
        title: 'Discord',
        icon: 'organization',
        command: { command: 'cody.sidebar.discord' },
    },
    {
        title: 'Account',
        icon: 'account',
        command: { command: 'cody.sidebar.account' },
    },
]

const commandsItems: CodySidebarTreeItem[] = [
    {
        title: 'Chat',
        icon: 'comment',
        description: 'Ask Cody a question',
        command: { command: 'cody.chat.panel.new' },
    },
    {
        title: 'Document',
        icon: 'book',
        description: 'Add code documentation',
        command: { command: 'cody.command.document-code' },
    },
    {
        title: 'Edit',
        icon: 'wand',
        command: { command: 'cody.command.edit-code' },
        description: 'Edit code with instructions',
    },
    {
        title: 'Explain',
        icon: 'file-binary',
        command: { command: 'cody.command.explain-code' },
        description: 'Explain code',
    },
    {
        title: 'Smell',
        icon: 'checklist',
        command: { command: 'cody.command.smell-code' },
        description: 'Identify code smells',
    },
    {
        title: 'Test',
        icon: 'package',
        command: { command: 'cody.command.unit-tests' },
        description: 'Generate unit tests',
    },
    {
        title: 'Custom',
        icon: 'tools',
        command: { command: 'cody.menu.custom-commands' },
        description: 'Custom commands',
    },
]
