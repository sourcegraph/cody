import classNames from 'classnames'

import styles from './Popup.module.css'

interface PopupOpenProps {
    isOpen: boolean
    onDismiss: () => void
}

interface BackdropProps {
    dismiss: () => void
}

const Backdrop: React.FunctionComponent<React.PropsWithoutRef<BackdropProps>> = ({ dismiss }) => {
    const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>): void => {
        if (e.key === 'Escape') {
            dismiss()
        }
    }
    const handleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
        e.stopPropagation()
        dismiss()
    }
    return <div className={styles.backdrop} onClick={handleClick} onKeyUp={handleKeyUp} role="presentation" />
}

interface PopupFrameProps {
    classNames?: string[]
    actionButtons?: React.ReactNode
}

export const PopupFrame: React.FunctionComponent<React.PropsWithChildren<PopupFrameProps & PopupOpenProps>> = ({
    actionButtons,
    classNames: extraClassNames,
    onDismiss,
    isOpen,
    children,
}) => {
    const handleKeyUp = (e: React.KeyboardEvent<HTMLDialogElement>): void => {
        if (e.key === 'Escape') {
            e.stopPropagation()
            onDismiss()
        }
    }
    return (
        isOpen && (
            <>
                <dialog
                    open={true}
                    className={classNames(styles.popup, ...(extraClassNames || []))}
                    onKeyUp={handleKeyUp}
                >
                    <div className={styles.row}>{children}</div>
                    {actionButtons && (
                        <div className={classNames(styles.actionButtonContainer, styles.row)}>{actionButtons}</div>
                    )}
                </dialog>
                <div className={styles.pointyBit} />
                <Backdrop dismiss={onDismiss} />
            </>
        )
    )
}
