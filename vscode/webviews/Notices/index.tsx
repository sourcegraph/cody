import { OnboardingAutocompleteNotice } from './OnboardingAutocompleteNotice'
import { VersionUpdatedNotice } from './VersionUpdatedNotice'

import styles from './index.module.css'

interface NoticesProps {
    probablyNewInstall: boolean
}

export const Notices: React.FunctionComponent<NoticesProps> = ({ probablyNewInstall }) => (
    <div className={styles.notices}>
        <VersionUpdatedNotice probablyNewInstall={probablyNewInstall} />
        <OnboardingAutocompleteNotice />
    </div>
)
