import { chatTips, chatLinks } from './WelcomeFooterContent'
import styles from './WelcomeFooter.module.css'

export default function WelcomeFooter() {
    function tips() {
        return chatTips.map((tip, key) => {
            const Icon = tip.icon
            return (
                <div key={`tip-${key + 1}`} className={styles.item}>
                    <Icon className="tw-w-8 tw-h-8" strokeWidth={1.25} />
                    <div className="tw-text-muted-foreground">{tip.message}</div>
                </div>
            )
        })
    }

    function links() {
        return chatLinks.map((link, key) => {
            const Icon = link.icon
            return (
                <div className={styles.item} key={`link-${key + 1}`}>
                    <Icon className="tw-w-8 tw-h-8" strokeWidth={1.25} />
                    <a href={link.url} rel="noreferrer" target="_blank">
                        {link.text}
                    </a>
                </div>
            )
        })
    }

    return (
        <div className={styles.welcomeFooter}>
            <div className={styles.tips}>{tips()}</div>
            <div className={styles.links}>{links()}</div>
        </div>
    )
}
