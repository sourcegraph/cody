import { ArrowRightIcon, HistoryIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { useMemo } from 'react'
import { getRelativeChatPeriod } from '../../../src/common/time-date'
import { Button } from '../../components/shadcn/ui/button'
import { Card, CardContent } from '../../components/shadcn/ui/card'
import { usePaginatedHistory } from '../../components/useUserHistory'
import { View } from '../../tabs/types'
import { getVSCodeAPI } from '../../utils/VSCodeApi'

interface LastConversationProps {
    setView: (view: View) => void
}

export const LastConversation: FunctionComponent<LastConversationProps> = ({ setView }) => {
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
    const displayTitle = lastChat.chatTitle?.trim() || lastMessage
    const timePeriod = getRelativeChatPeriod(new Date(lastChat.lastInteractionTimestamp))

    const handleChatClick = (chatID: string) => {
        getVSCodeAPI().postMessage({
            command: 'restoreHistory',
            chatID,
        })
        setView(View.Chat)
    }

    const handleViewAllClick = () => {
        setView(View.History)
    }

    return (
        <div>
            <div className="tw-mb-4 tw-flex tw-items-center tw-justify-end">
                <Button variant="ghost" size="sm" className="tw-pl-2" onClick={handleViewAllClick}>
                    View all
                    <ArrowRightIcon size={14} className="tw-ml-2 tw-h-4 tw-w-4" />
                </Button>
            </div>
            <Card
                className="tw-overflow-hidden tw-transition-all hover:tw-bg-muted/5 tw-cursor-pointer"
                onClick={() => handleChatClick(lastChat.lastInteractionTimestamp)}
            >
                <CardContent className="tw-p-4">
                    <div className="tw-flex tw-items-start tw-gap-5">
                        <div className="tw-flex-1 tw-space-y-1">
                            <div className="tw-flex tw-items-center tw-justify-between tw-gap-6">
                                <h3 className="tw-font-normal">{displayTitle}</h3>
                                <div className="tw-flex tw-items-center tw-text-xs tw-text-muted-foreground">
                                    <HistoryIcon size={12} className="tw-mr-1" />
                                    {timePeriod}
                                </div>
                            </div>
                            <p className="tw-line-clamp-1 tw-text-sm tw-text-muted-foreground">
                                {lastChat.model}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
