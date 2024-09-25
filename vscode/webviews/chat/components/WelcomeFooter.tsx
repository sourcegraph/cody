import { welcomeTips, welcomeLinks } from './WelcomeFooterContent'
import styles from './WelcomeFooter.module.css'

export default function WelcomeFooter() {
    const { welcomeFooter, tips, item, links, separator } = styles

    function generateTips() {
        return welcomeTips.map((tip, key) => {
            const Icon = tip.icon
            return (
                <div key={`tip-${key + 1}`} className={item}>
                    <Icon className="tw-w-8 tw-h-8" strokeWidth={1.25} />
                    <div className="tip">{tip.message}</div>
                </div>
            )
        })
    }

    function generateLinks() {
        return welcomeLinks.map((link, key) => {
            const Icon = link.icon
            return (
                <div className={item} key={`link-${key + 1}`}>
                    <Icon className="tw-w-8 tw-h-8" strokeWidth={1.25} />
                    <a href={link.url} className="tip" rel="noreferrer" target="_blank">
                        {link.text}
                    </a>
                </div>
            )
        })
    }

    return (
        <div className={welcomeFooter}>
            <div className={tips}>{generateTips()}</div>
            <div className={separator} />
            <div className={links}>{generateLinks()}</div>
        </div>
    )
}
