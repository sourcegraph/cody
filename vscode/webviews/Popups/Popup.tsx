import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import styles from './Popup.module.css'

export interface PopupOpenProps {
    isOpen: boolean
    onDismiss: () => void
}

interface PopupFrameProps {
    classNames?: string[]
    actionButtons?: React.ReactNode
}

interface PopupProps extends Omit<PopupFrameProps, 'classNames'>, PopupOpenProps {
    className?: string
    title: React.ReactNode
    text: React.ReactNode
    linkText: React.ReactNode
    linkHref: string
    linkTarget?: '_blank'
}

export const PopupFrame: React.FunctionComponent<React.PropsWithChildren<PopupFrameProps & PopupOpenProps>> = ({
    actionButtons,
    classNames: extraClassNames,
    isOpen,
    onDismiss,
    children,
}) =>
    isOpen && (
        <>
            <div className={classNames(styles.popup, ...(extraClassNames || []))}>
                <div className={styles.row}>
                    {children}
                    <div className={styles.noticeClose}>
                        <VSCodeButton appearance="icon" onClick={onDismiss}>
                            <i className="codicon codicon-close" />
                        </VSCodeButton>
                    </div>
                </div>
                {actionButtons && (
                    <div className={classNames(styles.actionButtonContainer, styles.row)}>{actionButtons}</div>
                )}
            </div>
            <div className={styles.pointyBit} />
        </>
    )

// Note, if the popup's parent is interactive, the button's event handlers should prevent event
// propagation.
export const Popup: React.FunctionComponent<React.PropsWithChildren<PopupProps>> = ({
    className,
    title,
    text,
    linkText,
    linkHref,
    linkTarget,
    actionButtons,
    onDismiss,
    isOpen,
}) => (
    <PopupFrame
        classNames={className ? [className] : []}
        isOpen={isOpen}
        onDismiss={onDismiss}
        actionButtons={actionButtons}
    >
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
    </PopupFrame>
)
