import React, { useEffect, useRef } from 'react'

import classNames from 'classnames'

import { isMacOS } from '../../Chat'

import styles from './ChatActions.module.css'

export const ChatActions: React.FunctionComponent<{
    isEditing: boolean
    isInProgress: boolean
    onChatResetClick: () => void
    updateEditMessageIndex: () => void
}> = React.memo(function ContextFilesContent({ isEditing, isInProgress, onChatResetClick, updateEditMessageIndex }) {
    const isMac = isMacOS()
    const metaKeyIcon = isMac ? '⌘' : 'Ctrl'

    const buttonRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (isInProgress && buttonRef.current) {
            buttonRef.current.focus()
        }
    }, [isInProgress])

    if (isEditing) {
        return (
            <div className={styles.chatActionsContainer}>
                <button
                    type="button"
                    className={classNames(styles.chatActionButtonContainer)}
                    onClick={updateEditMessageIndex}
                    title="Cancel Edit"
                >
                    <span className={styles.chatActionButtonTitle}>Cancel Edit</span> ESC
                </button>
            </div>
        )
    }

    return (
        <div className={styles.chatActionsContainer}>
            <button
                ref={buttonRef}
                type="button"
                className={classNames(styles.chatActionButtonContainer)}
                onClick={updateEditMessageIndex}
                title="Edit your last message"
                autoFocus={isInProgress}
            >
                <span className={styles.chatActionButtonTitle}>Edit Last Message</span> {metaKeyIcon} E
            </button>
            <button
                type="button"
                className={classNames(styles.chatActionButtonContainer)}
                onClick={onChatResetClick}
                title="Start a new chat session."
            >
                <span className={styles.chatActionButtonTitle}>New Chat</span> {metaKeyIcon} /
            </button>
        </div>
    )
})
