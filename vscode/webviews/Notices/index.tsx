import { VersionUpdatedNotice } from './VersionUpdatedNotice'

import styles from './index.module.css'

interface NoticesProps {
    extensionVersion: string
    probablyNewInstall: boolean
}

export const Notices: React.FunctionComponent<NoticesProps> = ({ extensionVersion, probablyNewInstall }) => (
    <div className={styles.notices}>
        <VersionUpdatedNotice version={extensionVersion} probablyNewInstall={probablyNewInstall} />
    </div>
)
