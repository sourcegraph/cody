import React, { useMemo } from 'react'

import styles from './NavBar.module.css'

export type View = 'chat' | 'recipes' | 'login' | 'history' | 'plugins'

interface NavBarProps {
    setView: (selectedView: View) => void
    view: View
    pluginsEnabled?: boolean
}

interface NavBarItem {
    title: string
    tab: View
}

const navBarItems: NavBarItem[] = [
    { tab: 'chat', title: 'Chat' },
    { tab: 'recipes', title: 'Recipes' },
]

export const NavBar: React.FunctionComponent<React.PropsWithChildren<NavBarProps>> = ({
    setView,
    view,
    pluginsEnabled = false,
}) => {
    const memoizedNavBarItems = useMemo(
        (): NavBarItem[] => (pluginsEnabled ? [...navBarItems, { tab: 'plugins', title: 'Plugins' }] : navBarItems),
        [pluginsEnabled]
    )
    return (
        <div className={styles.tabMenuContainer}>
            <div className={styles.tabMenuGroup}>
                {memoizedNavBarItems.map(({ title, tab }) => (
                    <button key={title} onClick={() => setView(tab)} className={styles.tabBtn} type="button">
                        <span className={view === tab ? styles.tabBtnSelected : ''}>{title}</span>
                    </button>
                ))}
            </div>
        </div>
    )
}
