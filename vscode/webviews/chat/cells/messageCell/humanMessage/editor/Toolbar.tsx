import { type FunctionComponent, useCallback, useState } from 'react'
import type { UserAccountInfo } from '../../../../../Chat'
import { ChatModelDropdownMenu } from '../../../../../Components/ChatModelDropdownMenu'
import { EnhancedContextSettings } from '../../../../../Components/EnhancedContextSettings'
import { useChatModelContext } from '../../../../models/chatModelContext'

/**
 * The toolbar for the human message editor.
 */
export const Toolbar: FunctionComponent<{
    userInfo: Pick<UserAccountInfo, 'isCodyProUser' | 'isDotComUser'>
    setEditorFocus: ((focused: boolean) => void) | undefined
}> = ({ userInfo, setEditorFocus }) => {
    const [isEnhancedContextOpen, setIsEnhancedContextOpen] = useState(false)
    const onEnhancedContextTogglerClick = useCallback(
        (open: boolean) => {
            if (!open) {
                setEditorFocus?.(true)
            }
            setIsEnhancedContextOpen(open)
        },
        [setEditorFocus]
    )

    const { chatModels, onCurrentChatModelChange } = useChatModelContext()

    return (
        <>
            {chatModels && onCurrentChatModelChange ? (
                <ChatModelDropdownMenu
                    models={chatModels}
                    onCurrentChatModelChange={onCurrentChatModelChange}
                    userInfo={{ isCodyProUser: true, isDotComUser: true }}
                    disabled={false}
                    showSelectionIcon={false}
                />
            ) : null}
            <EnhancedContextSettings
                isOpen={isEnhancedContextOpen}
                setOpen={onEnhancedContextTogglerClick}
                presentationMode={userInfo.isDotComUser ? 'consumer' : 'enterprise'}
                isNewInstall={IS_NEW_INSTALL}
            />
        </>
    )
}

// TODO!(sqs): only show model selector for dotcom users?

const IS_NEW_INSTALL = false // TODO!(sqs): pass this through from App
