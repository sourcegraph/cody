import type { FeatureFlag } from '@sourcegraph/cody-shared'
import { SupportSidebarItems } from './support-items'

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
    contextValue?: string
    isNestedItem?: boolean
    requireFeature?: FeatureFlag
    requireUpgradeAvailable?: boolean
    requireDotCom?: boolean
    requirePaid?: boolean
}

/**
 * Gets the tree view items to display based on the provided type.
 */
export function getCodyTreeItems(type: CodyTreeItemType): CodySidebarTreeItem[] {
    switch (type) {
        case 'support':
            return SupportSidebarItems
        default:
            return []
    }
}
