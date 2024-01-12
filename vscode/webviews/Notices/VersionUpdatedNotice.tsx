import { useState } from 'react'

import { version as packageVersion } from '../../package.json'
import { majorMinorVersion, releaseNotesURL } from '../../src/release'

import { Notice } from './Notice'

import styles from './VersionUpdatedNotice.module.css'

const key = 'notices.last-dismissed-version'

/**
 * Handles the logic of whether to show the latest version notice, and a
 * callback function for setting it as being dismissed.
 *
 * The first time this is run on a fresh install, we consider the version
 * update as being dismissed.
 */
const useShowNotice = (currentVersion: string, probablyNewInstall: boolean): [boolean, () => void] => {
    /* If this is a new install, we consider the current version dismissed already */
    if (probablyNewInstall) {
        localStorage.setItem(key, currentVersion)
    }

    const [showNotice, setShowNotice] = useState<boolean>(
        /* Version different to what's already dismissed means time for a notice */
        localStorage.getItem(key) !== currentVersion
    )

    const setDismissed = (): void => {
        localStorage.setItem(key, currentVersion)
        setShowNotice(false)
    }

    return [showNotice, setDismissed]
}

interface VersionUpdateNoticeProps {
    probablyNewInstall: boolean
}

export const VersionUpdatedNotice: React.FunctionComponent<VersionUpdateNoticeProps> = ({ probablyNewInstall }) => {
    const [showNotice, setDismissed] = useShowNotice(majorMinorVersion(packageVersion), probablyNewInstall)

    if (!showNotice) {
        return undefined
    }

    return (
        <Notice
            icon={<Icon />}
            title={`Cody updated to v${majorMinorVersion(packageVersion)}`}
            linkHref={releaseNotesURL(packageVersion)}
            linkText="See what’s new →"
            linkTarget="_blank"
            onDismiss={setDismissed}
        />
    )
}

const Icon: React.FunctionComponent = () => (
    <svg className={styles.icon} width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M10.3714 9.37143L9 14L7.62857 9.37143L3 8L7.62857 6.62857L9 2L10.3714 6.62857L15 8L10.3714 9.37143Z" />
        <path d="M21 12L17 14.2L13 12L15.2 16L13 20L17 17.8L21 20L18.8 16L21 12Z" />
        <path d="M8.3 19L10 16L7 17.7L4 16L5.7 19L4 22L7 20.3L10 22L8.3 19Z" />
    </svg>
)
