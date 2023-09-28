import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import styles from './Notice.module.css'

export interface NoticeProps {
    icon: React.ReactNode
    title: React.ReactNode
    text?: React.ReactNode
    linkText?: React.ReactNode
    linkHref?: string
    linkTarget?: '_blank' | undefined
    className?: string
    onDismiss: () => void
}

export const Notice: React.FunctionComponent<React.PropsWithChildren<NoticeProps>> = ({
    icon,
    title,
    text,
    linkText,
    linkHref,
    linkTarget,
    onDismiss,
    className,
}) => (
    <div className={classNames(styles.notice, className)}>
        <div className={styles.noticeIcon}>{icon}</div>
        <div className={styles.noticeText}>
            <h1>{title}</h1>
            {text && <p>{text}</p>}
            {linkText && linkHref && (
                <p>
                    <VSCodeLink href={linkHref} target={linkTarget}>
                        {linkText}
                    </VSCodeLink>
                </p>
            )}
        </div>
        <div className={styles.noticeClose}>
            <VSCodeButton appearance="icon" onClick={onDismiss}>
                <i className="codicon codicon-close" />
            </VSCodeButton>
        </div>
    </div>
)
