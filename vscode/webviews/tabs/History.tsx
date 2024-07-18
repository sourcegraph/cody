import type { SerializedChatTranscript } from '@sourcegraph/cody-shared'
import { MessageSquareTextIcon } from 'lucide-react'
import { useMemo } from 'react'
import { getRelativeChatPeriod } from '../../src/common/time-date'
import { Button } from '../components/shadcn/ui/button'
import { getVSCodeAPI } from '../utils/VSCodeApi'

interface HistoryTabProps {
    userHistory: SerializedChatTranscript[]
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ userHistory }) => {
    const chatByPeriod = useMemo(
        () =>
            userHistory
                .filter(chat => chat.interactions.length)
                .reverse()
                .reduce((acc, chat) => {
                    const period = getRelativeChatPeriod(new Date(chat.lastInteractionTimestamp))
                    acc.set(period, [...(acc.get(period) || []), chat])
                    return acc
                }, new Map<string, SerializedChatTranscript[]>()),
        [userHistory]
    )

    return (
        <div className="tw-flex tw-flex-col tw-gap-4 tw-px-8">
            {Array.from(chatByPeriod, ([period, chats]) => (
                <div className="tw-flex tw-flex-col tw-gap-2 tw-w-full" key={period}>
                    <p className="tw-py-3 tw-text-muted-foreground">{period}</p>
                    <div className="tw-px-8 tw-py-4 tw-flex tw-flex-col tw-gap-4 tw-bg-popover tw-border tw-border-border tw-rounded-lg tw-items-baseline">
                        {chats.map(({ interactions, id }) => {
                            const lastMessage =
                                interactions[interactions.length - 1]?.humanMessage?.text?.trim()
                            return (
                                <Button
                                    key={id}
                                    variant="text"
                                    size="none"
                                    title={lastMessage}
                                    onClick={() =>
                                        getVSCodeAPI().postMessage({
                                            command: 'restoreHistory',
                                            chatID: id,
                                        })
                                    }
                                    className="tw-w-full"
                                >
                                    <span className="tw-truncate tw-w-full">
                                        <MessageSquareTextIcon className="tw-inline-flex" size={13} />
                                        <span className="tw-px-2 tw-truncate tw-w-full">
                                            {lastMessage}
                                        </span>
                                    </span>
                                </Button>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}
