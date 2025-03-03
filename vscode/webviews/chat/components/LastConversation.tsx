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
        <Button
            variant="outline"
            className="tw-w-full tw-flex tw-items-center tw-gap-2 tw-px-3 tw-py-2 tw-text-left tw-border-gray-500/20 dark:tw-border-gray-600/40"
            onClick={handleClick}
        >
            <HistoryIcon size={16} className="tw-text-foreground/80" />
            <div className="tw-flex-1 tw-min-w-0">
                <div className="tw-text-sm tw-font-medium tw-text-foreground/80 tw-truncate">
                    {truncatedText}
                </div>
                <div className="tw-text-xs tw-text-foreground/60">{timePeriod}</div>
            </div>
        </Button>
    )
}
