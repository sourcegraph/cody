import React from 'react'

import styles from './NavBar.module.css'

export type View = 'chat' | 'login' | 'history'

interface NavBarProps {
    setView: (selectedView: View) => void
    view: View
}

interface NavBarItem {
    title: string
    tab: View
}

const navBarItems: NavBarItem[] = [{ tab: 'chat', title: 'Chat' }]

export const NavBar: React.FunctionComponent<React.PropsWithChildren<NavBarProps>> = ({ setView, view }) => (
    <div className={styles.tabMenuContainer}>
        <div className={styles.tabMenuGroup}>
            {navBarItems.map(({ title, tab }) => (
                <button key={title} onClick={() => setView(tab)} className={styles.tabBtn} type="button">
                    <span className={view === tab ? styles.tabBtnSelected : ''}>{title}</span>
                </button>
            ))}
        </div>
    </div>
)
