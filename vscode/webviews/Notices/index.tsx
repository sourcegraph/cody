import { VersionUpdatedNotice } from './VersionUpdatedNotice'

import styles from './index.module.css'

interface NoticesProps {
    extensionVersion: string
    probablyNewInstall: boolean
}

export const Notices: React.FunctionComponent<NoticesProps> = ({ extensionVersion, probablyNewInstall }) => (
    <NoticesContainer>
        <VersionUpdatedNotice version={extensionVersion} probablyNewInstall={probablyNewInstall} />
        {/* <OnboardingAutocompleteNotice /> */}
    </NoticesContainer>
)

const NoticesContainer: React.FunctionComponent<React.PropsWithChildren> = ({ children }) => (
    <div className={styles.notices}>{children}</div>
)
