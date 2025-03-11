
import { TabsBar } from '../../tabs/TabsBar'
import { type FC, useEffect, useRef } from 'react'
import type { Model, AuthenticatedAuthStatus, CodyIDE } from '@sourcegraph/cody-shared'
import { View } from '../../tabs/types'


interface ResponsiveTabsBarProps {
    models?: Model[]
    user: {
        isDotComUser: boolean
        isCodyProUser: boolean
        user: Pick<
            AuthenticatedAuthStatus,
            'username' | 'displayName' | 'avatarURL' | 'endpoint' | 'primaryEmail' | 'organizations'
        >
        IDE: CodyIDE
    }
    currentView: View
    setView: (view: View) => void
    endpointHistory: string[]
    isWorkspacesUpgradeCtaEnabled?: boolean
    hideHistoryTab: boolean
}

/**
 * A wrapper around TabsBar that hides the History tab when hideHistoryTab is true
 */
export const ResponsiveTabsBar: FC<ResponsiveTabsBarProps> = props => {
    // Reference to find the tab elements after render
    const tabsBarRef = useRef<HTMLDivElement>(null)
    
    // Add an effect to hide/show the History tab button based on screen width
    useEffect(() => {
        if (!tabsBarRef.current) return

        // Find the History tab button
        const historyTabButton = tabsBarRef.current.querySelector('[data-testid="tab-history"]')
        if (historyTabButton instanceof HTMLElement) {
            if (props.hideHistoryTab) {
                historyTabButton.style.display = 'none'
            } else {
                historyTabButton.style.display = ''
            }
        }
    }, [tabsBarRef, props.hideHistoryTab])

    return (
        <div ref={tabsBarRef}>
            <TabsBar
                models={props.models}
                user={props.user}
                currentView={props.currentView}
                setView={props.setView}
                endpointHistory={props.endpointHistory}
                isWorkspacesUpgradeCtaEnabled={props.isWorkspacesUpgradeCtaEnabled}
            />
        </div>
    )
}