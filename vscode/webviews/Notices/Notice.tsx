import { useCallback, useState } from 'react'

import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import styles from './Notice.module.css'

interface NoticeProps {
    icon: React.ReactNode
    title: React.ReactNode
    text?: React.ReactNode
    linkText?: React.ReactNode
    linkHref?: string
    linkTarget?: '_blank' | undefined
    className?: string
    onDismiss?: () => void
    dismissKey?: string
}

/**
 * Renders notices component with icon, title, optional link, and dismiss button.
 * Handles dismissing state using localstorage based on the given dismissKey.
 * Dismiss behavior can be overridden by passing an onDismiss callback.
 */
export const Notice: React.FunctionComponent<React.PropsWithChildren<NoticeProps>> = ({
    icon,
    title,
    text,
    linkText,
    linkHref,
    linkTarget,
    onDismiss,
    dismissKey,
    className,
}) => {
    const [dismissed, setDismissed] = useState<boolean>((dismissKey && hasBeenDismissed(dismissKey)) || false)

    const defaultOnDismiss = useCallback(() => {
        if (dismissKey) {
            setHasBeenDismissed(dismissKey)
            setDismissed(true)
        }
    }, [dismissKey])

    if (dismissed) {
        return undefined
    }

    return (
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
                <VSCodeButton appearance="icon" onClick={onDismiss || defaultOnDismiss}>
                    <i className="codicon codicon-close" />
                </VSCodeButton>
            </div>
        </div>
    )
}

const storageKey = (key: string): string => `notices.dismissed.${key}`

const hasBeenDismissed = (key: string): boolean => localStorage.getItem(storageKey(key)) === 'true'

const setHasBeenDismissed = (key: string): void => localStorage.setItem(storageKey(key), 'true')
