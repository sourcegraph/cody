import type { FeatureFlag } from '@sourcegraph/cody-shared'

import { releaseType } from '../../release'
import { version } from '../../version'

export type CodyTreeItemType = 'command' | 'support' | 'search' | 'chat'

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
        case 'support':
            return supportItems
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
