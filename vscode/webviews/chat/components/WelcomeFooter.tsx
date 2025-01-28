import { CodyIDE } from '@sourcegraph/cody-shared'
import { QuickStart } from './QuickStart'
import styles from './WelcomeFooter.module.css'

import { ExtensionPromotionalBanner } from '../../components/ExtensionPromotionalBanner'

export default function WelcomeFooter({ IDE }: { IDE: CodyIDE }): JSX.Element {
    return (
        <div className={styles.welcomeFooter}>
            {IDE === CodyIDE.Web && <ExtensionPromotionalBanner IDE={IDE} />}
            <QuickStart />
        </div>
    )
}
