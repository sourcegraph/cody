import type { CodyIDE } from '@sourcegraph/cody-shared'
import { VersionUpdatedNotice } from './VersionUpdatedNotice'

import styles from './index.module.css'

interface NoticesProps {
    probablyNewInstall: boolean | undefined
    IDE?: CodyIDE
    version?: string
}

export const Notices: React.FunctionComponent<NoticesProps> = ({ probablyNewInstall, IDE, version }) => (
    <div className={styles.notices}>
        {probablyNewInstall !== undefined && IDE !== undefined && version !== undefined && (
            <VersionUpdatedNotice probablyNewInstall={probablyNewInstall} IDE={IDE} version={version} />
        )}
    </div>
)
