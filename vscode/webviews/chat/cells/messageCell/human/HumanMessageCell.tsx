import type { ChatMessage } from '@sourcegraph/cody-shared'
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import { type ComponentProps, type FunctionComponent, useMemo } from 'react'
import type { UserAccountInfo } from '../../../../Chat'
import { UserAvatar } from '../../../../components/UserAvatar'
import { serializedPromptEditorStateFromChatMessage } from '../../../../promptEditor/PromptEditor'
import { getVSCodeAPI } from '../../../../utils/VSCodeApi'
import { ChatMessageContent } from '../../../ChatMessageContent'
import { BaseMessageCell } from '../BaseMessageCell'
import styles from './HumanMessageCell.module.css'

/**
 * A component that displays a chat message from the human.
 */
export const HumanMessageCell: FunctionComponent<{
    message: ChatMessage
    userInfo: UserAccountInfo

    messageIndexInTranscript: number
    showEditButton: boolean
    beingEdited: number | undefined
    setBeingEdited: (index?: number) => void
}> = ({ message, userInfo, messageIndexInTranscript, showEditButton, beingEdited, setBeingEdited }) => {
    const displayMarkdown = useMemo(
        () => serializedPromptEditorStateFromChatMessage(message).html,
        [message]
    )

    const isInEditingMode = beingEdited !== undefined
    const isItemBeingEdited = beingEdited === messageIndexInTranscript

    return (
        <BaseMessageCell
            speaker="human"
            speakerIcon={<UserAvatar user={userInfo.user} size={24} />}
            content={
                <div className={styles.content}>
                    <ChatMessageContent
                        displayMarkdown={displayMarkdown}
                        wrapLinksWithCodyCommand={false}
                        className={styles.contentMessage}
                    />
                    {showEditButton && (
                        <EditButton
                            className={styles.editButton}
                            tabIndex={isInEditingMode ? -1 : undefined}
                            aria-hidden={isInEditingMode}
                            messageBeingEdited={messageIndexInTranscript}
                            setMessageBeingEdited={setBeingEdited}
                            disabled={isInEditingMode}
                        />
                    )}
                </div>
            }
            disabled={isInEditingMode && !isItemBeingEdited}
            focused={isItemBeingEdited}
        />
    )
}

const EditButton: React.FunctionComponent<
    {
        className: string
        disabled?: boolean
        messageBeingEdited: number | undefined
        setMessageBeingEdited: (index?: number) => void
    } & Pick<ComponentProps<typeof VSCodeButton>, 'aria-hidden' | 'tabIndex'>
> = ({
    className,
    messageBeingEdited,
    setMessageBeingEdited,
    disabled,
    'aria-hidden': ariaHidden,
    tabIndex,
}) => (
    <VSCodeButton
        className={className}
        appearance="icon"
        title={disabled ? 'Cannot Edit Command' : 'Edit Your Message'}
        type="button"
        disabled={disabled}
        aria-hidden={ariaHidden}
        tabIndex={tabIndex}
        onClick={() => {
            setMessageBeingEdited(messageBeingEdited)
            getVSCodeAPI().postMessage({
                command: 'event',
                eventName: 'CodyVSCodeExtension:chatEditButton:clicked',
                properties: { source: 'chat' },
            })
        }}
    >
        <i className="codicon codicon-edit" />
    </VSCodeButton>
)
