import { VersionUpdatedNotice } from './VersionUpdatedNotice'

// import { OnboardingAutocompleteNotice } from './OnboardingAutocompleteNotice'

import styles from './index.module.css'

interface NoticesProps {
    extensionVersion: string
}

export const Notices: React.FunctionComponent<NoticesProps> = ({ extensionVersion }) => (
    <NoticesContainer>
        <VersionUpdatedNotice version={extensionVersion} />
        {/* <OnboardingAutocompleteNotice /> */}
    </NoticesContainer>
)

const NoticesContainer: React.FunctionComponent<React.PropsWithChildren> = ({ children }) => (
    <div className={styles.notices}>{children}</div>
)
