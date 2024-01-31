import type { FeatureFlag } from '@sourcegraph/cody-shared'

import { CODY_DOC_URL, CODY_FEEDBACK_URL, DISCORD_URL } from '../chat/protocol'
import { releaseNotesURL, releaseType } from '../release'
import { version } from '../version'

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
        case 'command':
            return commandsItems
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
        command: { command: 'cody.status-bar.interacted' },
    },
    {
        title: 'Keyboard Shortcuts',
        icon: 'keyboard',
        command: {
            command: 'workbench.action.openGlobalKeybindings',
            args: ['@ext:sourcegraph.cody-ai'],
        },
    },
    {
        title: `${releaseType(version) === 'stable' ? 'Release' : 'Pre-Release'} Notes`,
        description: `v${version}`,
        icon: 'github',
        command: {
            command: 'vscode.open',
            args: [releaseNotesURL(version)],
        },
    },
    {
        title: 'Documentation',
        icon: 'book',
        command: { command: 'vscode.open', args: [CODY_DOC_URL.href] },
    },
    {
        title: 'Feedback',
        icon: 'feedback',
        command: { command: 'vscode.open', args: [CODY_FEEDBACK_URL.href] },
    },
    {
        title: 'Discord',
        icon: 'organization',
        command: { command: 'vscode.open', args: [DISCORD_URL.href] },
    },
    {
        title: 'Account',
        icon: 'account',
        command: { command: 'cody.auth.account' },
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
        description: 'Generate unit tests (edit)',
    },
    {
        title: 'Unit',
        icon: 'beaker',
        command: { command: 'cody.command.generate-tests' },
        description: 'Generate unit tests (chat)',
    },
    {
        title: 'Custom',
        icon: 'tools',
        command: { command: 'cody.menu.custom-commands' },
        description: 'Custom commands',
    },
]
