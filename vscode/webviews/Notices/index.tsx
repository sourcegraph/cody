import { useCallback, useState } from 'react'

import { OnboardingAutocompleteNotice } from './OnboardingAutocompleteNotice'
import { UpdateNotice } from './UpdateNotice'

import styles from './index.module.css'

interface NoticesProps {
    extensionVersion: string
}

export const Notices: React.FunctionComponent<NoticesProps> = ({ extensionVersion }) => {
    // TODO: Implement (true when version is different from last load — localstorage?)
    const [showUpdateNotice, setShowUpdateNotice] = useState<boolean>(true)
    const handleUpdateNoticeClose = useCallback(() => {
        setShowUpdateNotice(false)
    }, [])

    // TODO: Implement (true when user first accepts an autocomplete message — onMessage?)
    const [showAutocompleteNotice, setShowAutocompleteNotice] = useState<boolean>(true)
    const handleAutocompleteNoticeClose = useCallback(() => {
        setShowAutocompleteNotice(false)
    }, [])

    return (
        <NoticesContainer>
            {showUpdateNotice && <UpdateNotice version={extensionVersion} onDismiss={handleUpdateNoticeClose} />}
            {showAutocompleteNotice && <OnboardingAutocompleteNotice onDismiss={handleAutocompleteNoticeClose} />}
        </NoticesContainer>
    )
}

const NoticesContainer: React.FunctionComponent<React.PropsWithChildren> = ({ children }) => (
    <div className={styles.notices}>{children}</div>
)
