import { type FunctionComponent, useCallback, useState } from 'react'
import type { UserAccountInfo } from '../../../../../Chat'
import { ChatModelDropdownMenu } from '../../../../../Components/ChatModelDropdownMenu'
import { useChatModelContext } from '../../../../models/chatModelContext'
import { ContextDropdownButton } from './toolbar/ContextDropdownButton'

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
            <ContextDropdownButton />
            {chatModels && onCurrentChatModelChange ? (
                <ChatModelDropdownMenu
                    models={chatModels}
                    onCurrentChatModelChange={onCurrentChatModelChange}
                    userInfo={{ isCodyProUser: true, isDotComUser: true }}
                    disabled={false}
                    showSelectionIcon={false}
                />
            ) : null}
        </>
    )
}

// TODO!(sqs): only show model selector for dotcom users?

const IS_NEW_INSTALL = false // TODO!(sqs): pass this through from App
