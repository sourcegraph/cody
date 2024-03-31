import type React from 'react'

import classNames from 'classnames'

import type { ChatMessage, Guardrails } from '@sourcegraph/cody-shared'

import type { UserAccountInfo } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import type { CodeBlockActionsProps } from './ChatMessageContent'

import styles from './TranscriptItem.module.css'

/**
 * A single message in the chat transcript.
 */
export const TranscriptItem: React.FunctionComponent<{
    index: number
    message: ChatMessage
    isLoading: boolean
    beingEdited: number | undefined
    setBeingEdited: (index?: number) => void
    showEditButton: boolean
    feedbackButtonsOnSubmit?: (text: string) => void
    showFeedbackButtons: boolean
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
    userInfo: UserAccountInfo
    postMessage?: ApiPostMessage
    guardrails?: Guardrails
}> = ({
    index,
    message,
    isLoading,
    beingEdited,
    setBeingEdited,
    showEditButton,
    feedbackButtonsOnSubmit,
    showFeedbackButtons,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    userInfo,
    postMessage,
    guardrails,
}) => {
    return (
        <div
            className={classNames(
                styles.row,
                isHumanMessage ? styles.humanRow : styles.assistantRow,
                // When editing a message, all other messages (both human and assistant messages) are blurred (unfocused)
                // except for the current message (transcript item) that is being edited (focused)
                isInEditingMode && (!isHumanMessage || !isItemBeingEdited) && styles.unfocused,
                isItemBeingEdited && styles.focused
            )}
        ></div>
    )
}
