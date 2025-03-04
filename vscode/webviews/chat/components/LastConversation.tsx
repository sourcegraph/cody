import type { CodyIDE } from '@sourcegraph/cody-shared'
import { HistoryIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { useMemo } from 'react'
import { getRelativeChatPeriod } from '../../../src/common/time-date'
import { Button } from '../../components/shadcn/ui/button'
import { usePaginatedHistory } from '../../components/useUserHistory'
import { View } from '../../tabs/types'
import { getVSCodeAPI } from '../../utils/VSCodeApi'

interface LastConversationProps {
    setView: (view: View) => void
    IDE: CodyIDE
}

export const LastConversation: FunctionComponent<LastConversationProps> = ({ setView, IDE }) => {
    // Use the paginated history hook with page 1 and pageSize 1 to get only the most recent chat
    const { value: paginatedHistory } = usePaginatedHistory(1, 1)

    const lastChat = useMemo(() => {
        if (!paginatedHistory?.items?.length) {
            return null
        }
        return paginatedHistory.items[0]
    }, [paginatedHistory])

    if (!lastChat) {
        return null
    }

    const lastMessage = lastChat.lastHumanMessageText || ''
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
