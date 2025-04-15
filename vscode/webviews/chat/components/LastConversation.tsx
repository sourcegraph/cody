import type { CodyIDE } from '@sourcegraph/cody-shared'
import { ArrowRightIcon, HistoryIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { useMemo } from 'react'
import { getRelativeChatPeriod } from '../../../src/common/time-date'
import { Button } from '../../components/shadcn/ui/button'
import { Card, CardContent } from '../../components/shadcn/ui/card'
import { useUserHistory } from '../../components/useUserHistory'
import { View } from '../../tabs/types'
import { getVSCodeAPI } from '../../utils/VSCodeApi'

interface LastConversationProps {
    setView: (view: View) => void
    IDE: CodyIDE
}

export const LastConversation: FunctionComponent<LastConversationProps> = ({ setView }) => {
    const userHistory = useUserHistory()

    const lastChat = useMemo(() => {
        if (!userHistory) {
            return null
        }

        // Convert to array once and sort by timestamp
        return (
            Object.values(userHistory)
                .filter(chat => chat.firstHumanMessageText?.trim())
                .sort(
                    (a, b) =>
                        new Date(b.lastInteractionTimestamp).getTime() -
                        new Date(a.lastInteractionTimestamp).getTime()
                )[0] || null
        )
    }, [userHistory])

    // Early return if no chat history exists
    if (!lastChat?.chatTitle?.trim()) {
        return null
    }

    const displayText = lastChat.chatTitle?.trim()
    const timePeriod = getRelativeChatPeriod(new Date(lastChat.lastInteractionTimestamp))

    // Handler functions
    const handleClick = () => {
        getVSCodeAPI().postMessage({
            command: 'restoreHistory',
            chatID: lastChat.lastInteractionTimestamp,
        })
        setView(View.Chat)
    }

    const handleViewAllClick = () => setView(View.History)

    return (
        <div>
            <div className="tw-mb-4 tw-flex tw-items-center tw-justify-end tw-border-1 tw-border-[var(--vscode-dropdown-border, transparent)]">
                <Button variant="ghost" size="sm" className="tw-pl-2" onClick={handleViewAllClick}>
                    View all
                    <ArrowRightIcon size={14} className="tw-ml-2" />
                </Button>
            </div>
            <Card
                className="tw-overflow-hidden tw-transition-all hover:tw-bg-muted/5 tw-cursor-pointer"
                onClick={handleClick}
            >
                <CardContent className="tw-p-4">
                    <div className="tw-flex tw-items-start">
                        <div className="tw-flex-1 tw-space-y-1 tw-overflow-y-auto">
                            <h3 className="tw-font-normal tw-text-left tw-truncate tw-w-full">
                                {displayText}
                            </h3>
                            <p className="tw-line-clamp-1 tw-text-sm tw-text-muted-foreground">
                                <div className="tw-inline-flex tw-items-center tw-text-xs tw-text-muted-foreground">
                                    <HistoryIcon size={12} className="tw-inline-block tw-mr-1" />
                                    {timePeriod}
                                </div>
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
