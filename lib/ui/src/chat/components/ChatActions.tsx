import React from 'react'

import classNames from 'classnames'

import { isMacOS } from '../../Chat'

import styles from './ChatActions.module.css'

export const ChatActions: React.FunctionComponent<{
    disabled: boolean
    onChatResetClick: () => void
    editLastMessage: () => void
}> = React.memo(function ContextFilesContent({ onChatResetClick, editLastMessage, disabled }) {
    const isMac = isMacOS()
    const metaKeyIcon = isMac ? '⌘' : 'Ctrl'
    const warning = 'Submit your first question to get started.'

    return (
        <div className={styles.chatActionsContainer}>
            <button
                type="button"
                className={classNames(styles.chatActionButtonContainer, disabled && styles.disable)}
                onClick={editLastMessage}
                disabled={disabled}
                title={disabled ? warning : 'Edit and re-send your last message'}
            >
                <span className={styles.chatActionButtonTitle}>Edit & Retry</span> {metaKeyIcon} E
            </button>
            <button
                type="button"
                className={classNames(styles.chatActionButtonContainer, disabled && styles.disable)}
                onClick={onChatResetClick}
                disabled={disabled}
                title={disabled ? warning : 'Start a new chat session.'}
            >
                <span className={styles.chatActionButtonTitle}>New Chat</span> {metaKeyIcon} /
            </button>
        </div>
    )
})
