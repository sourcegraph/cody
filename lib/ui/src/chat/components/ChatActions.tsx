import React, { useEffect, useRef } from 'react'

import { isMacOS } from '../../Chat'

import styles from './ChatActions.module.css'

export const ChatActions: React.FunctionComponent<{
    isEditing: boolean
    isMessageInProgress: boolean
    onChatResetClick: () => void
    onCancelEditClick: () => void
    onEditLastMessageClick: () => void
    setInputFocus: (focus: boolean) => void
}> = React.memo(function ContextFilesContent({
    isEditing,
    isMessageInProgress,
    onChatResetClick,
    onCancelEditClick,
    onEditLastMessageClick,
    setInputFocus,
}) {
    // "⌘" on Mac or "Ctrl" on other systems
    const isMac = isMacOS()
    const osIcon = isMac ? '⌘' : 'Ctrl+'
    // The Chat Actions are conditionally rendered based on the 'when' property.
    // The "Cancel Edit" action is only available when isEditing is true, meaning
    // the user is in the process of editing a message.
    // The "Edit Last Message" and "New Chat" actions are available when isEditing is false,
    // indicating that the user is not editing a message and can either edit their last message
    // or start a new chat session via these buttons that also have keyboard shortcuts associated with them.
    const actions = [
        {
            name: 'Cancel Edit',
            keybind: 'ESC',
            onClick: onCancelEditClick,
            focus: false,
            when: isEditing,
        },
        {
            name: 'Edit Last Message',
            keybind: `${osIcon}K`,
            onClick: onEditLastMessageClick,
            focus: true,
            when: !isEditing,
        },
        {
            name: 'Start New Chat',
            keybind: `${osIcon}/`,
            onClick: onChatResetClick,
            focus: false,
            when: !isEditing,
        },
    ]

    const buttonRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        // Focus on the Edit button after a question has been submitted
        // This allows users to edit the message they just submitted right away
        if (!isEditing && isMessageInProgress) {
            setInputFocus(false)
            buttonRef?.current?.focus()
        }
        // Remove focus on the Edit button when stream ends
        if (!isEditing && !isMessageInProgress) {
            buttonRef?.current?.blur()
            setInputFocus(true)
            return
        }
        // remove the focus when ESC key is pressed
        buttonRef?.current?.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                setInputFocus(true)
                buttonRef?.current?.blur()
            }
        })
    }, [isMessageInProgress, isEditing, setInputFocus])

    return (
        <div className={styles.chatActionsContainer}>
            {actions
                .filter(item => item.when)
                .map(action => (
                    <button
                        key={action.name}
                        ref={isMessageInProgress && action.focus ? buttonRef : undefined}
                        type="button"
                        className={styles.chatActionButton}
                        onClick={action.onClick}
                    >
                        <span className={styles.chatActionButtonTitle}>
                            {action.name}{' '}
                            <span className={styles.chatActionKeybind}>{action.keybind}</span>
                        </span>
                    </button>
                ))}
        </div>
    )
})
