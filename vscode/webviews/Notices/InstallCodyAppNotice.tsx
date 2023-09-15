import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import styles from './InstallCodyAppNotice.module.css'

interface InstallCodyNoticeProps {
    className?: string
    title: React.ReactNode
    text: React.ReactNode
    linkText: React.ReactNode
    linkHref: string
    linkTarget?: '_blank' | undefined
    actionButtons?: React.ReactNode
    onDismiss: () => void
}

export const InstallCodyAppNotice: React.FunctionComponent<React.PropsWithChildren<InstallCodyNoticeProps>> = ({
    className,
    title,
    text,
    linkText,
    linkHref,
    linkTarget,
    actionButtons,
    onDismiss,
}) => (
    <div className={classNames(styles.notice, className)}>
        <div className={styles.row}>
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
        {actionButtons && <div className={classNames(styles.actionButtonContainer, styles.row)}>{actionButtons}</div>}
    </div>
)
