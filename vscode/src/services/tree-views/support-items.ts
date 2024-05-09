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
        requireUpgradeAvailable: true,
    },
    {
        title: 'Account',
        icon: 'account',
        command: { command: 'cody.sidebar.account' },
        requirePaid: false,
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
    // Note: Currently disabled due to an issue where this occasionally evaluates the feature flag
    // __before__ the user is fully finished authenticating. This will cache an incorrectly
    // false value which inteferes with the balance of an ongoing A/B test.
    // {
    //     title: 'Tutorial',
    //     icon: 'tasklist',
    //     command: { command: 'cody.sidebar.tutorial' },
    //     requireFeature: FeatureFlag.CodyInteractiveTutorial,
    // },
    {
        title: 'Documentation',
        icon: 'book',
        command: { command: 'cody.sidebar.documentation' },
    },
    {
        title: 'Support',
        icon: 'question',
        command: { command: 'cody.sidebar.support' },
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
]
