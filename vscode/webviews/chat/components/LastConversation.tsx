import type { CodyIDE } from '@sourcegraph/cody-shared'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { HistoryIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { useMemo } from 'react'
import { getRelativeChatPeriod } from '../../../src/common/time-date'
import { Button } from '../../components/shadcn/ui/button'
import { View } from '../../tabs/types'
import { getVSCodeAPI } from '../../utils/VSCodeApi'

interface LastConversationProps {
    setView: (view: View) => void
    IDE: CodyIDE
}

function useUserHistory() {
    const userHistory = useExtensionAPI().userHistory
    return useObservable(useMemo(() => userHistory(), [userHistory])).value
}

export const LastConversation: FunctionComponent<LastConversationProps> = ({ setView, IDE }) => {
    const userHistory = useUserHistory()

    const lastChat = useMemo(() => {
        if (!userHistory?.chat) {
            return null
        }
        const chats = Object.values(userHistory.chat)
            .filter(chat => chat.interactions.length > 0)
            .sort(
                (a, b) =>
                    new Date(b.lastInteractionTimestamp).getTime() -
                    new Date(a.lastInteractionTimestamp).getTime()
            )
        return chats[0] || null
    }, [userHistory])

    if (!lastChat) {
        return null
    }

    const lastMessage =
        lastChat.interactions[lastChat.interactions.length - 1]?.humanMessage?.text?.trim() || ''
    const displayText = lastChat.chatTitle?.trim() || lastMessage
    const truncatedText = displayText.length > 50 ? displayText.slice(0, 47) + '...' : displayText
    const timePeriod = getRelativeChatPeriod(new Date(lastChat.lastInteractionTimestamp))

    const handleClick = () => {
        getVSCodeAPI().postMessage({
            command: 'restoreHistory',
            chatID: lastChat.lastInteractionTimestamp,
        })
        setView(View.Chat)
    }

    return (
        <div>
            <div className="tw-text-muted-foreground tw-text-base tw-mb-2 tw-px-1">Last Conversation</div>
            <Button
                variant="secondary"
                className="tw-w-full tw-flex tw-items-center tw-gap-2 tw-px-4 tw-py-3 tw-mb-8 tw-text-left tw-bg-[var(--vscode-dropdown-background)]"
                onClick={handleClick}
            >
                <HistoryIcon size={20} className="_prompt--icon_1lclp_18" />
                <div className="tw-flex tw-flex-1 tw-min-w-0 tw-items-center tw-justify-between">
                    <div>
                        <strong className="_prompt--name_1lclp_1">{truncatedText}</strong>
                    </div>
                    <span className="_prompt--description_1lclp_18 tw-ml-4 tw-text-xs">{timePeriod}</span>
                </div>
            </Button>
        </div>
    )
}
