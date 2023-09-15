import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import noticeStyles from './Notice.module.css'

interface InstallCodyNoticeProps {
    className?: string
    title: React.ReactNode
    text: React.ReactNode
    linkText: React.ReactNode
    linkHref: string
    linkTarget?: '_blank' | undefined
    actionButtons?: React.ReactNode[]
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
    <div className={classNames(noticeStyles.notice, className)}>
        <div className={noticeStyles.noticeText}>
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
        {actionButtons && <div>{...actionButtons}</div>}
        <div className={noticeStyles.noticeClose}>
            <VSCodeButton appearance="icon" onClick={onDismiss}>
                <i className="codicon codicon-close" />
            </VSCodeButton>
        </div>
    </div>
)
