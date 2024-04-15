import { releaseType } from '../../release'
import { version } from '../../version'
import type { CodySidebarTreeItem } from './treeViewItems'

export const SupportSidebarItems: CodySidebarTreeItem[] = [
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
        contextValue: 'cody.version',
    },
    {
        title: 'Documentation',
        icon: 'book',
        command: { command: 'cody.sidebar.documentation' },
    },
    {
        title: 'Support',
        icon: 'question',
        command: { command: 'cody.sidebar.support' },
        requirePaid: true,
    },
    {
        title: 'Community Forum',
        icon: 'organization',
        command: { command: 'cody.sidebar.community' },
    },
    {
        title: 'Feedback',
        icon: 'feedback',
        command: { command: 'cody.sidebar.feedback' },
    },
    {
        title: 'Discord',
        icon: 'discord-logo',
        command: { command: 'cody.sidebar.discord' },
    },
    {
        title: 'Account',
        icon: 'account',
        command: { command: 'cody.sidebar.account' },
    },
]
