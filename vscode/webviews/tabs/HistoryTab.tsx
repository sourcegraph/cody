import type { SerializedChatTranscript } from '@sourcegraph/cody-shared'
import { MessageSquareTextIcon } from 'lucide-react'
import { useMemo } from 'react'
import { getRelativeChatPeriod } from '../../src/common/time-date'
import { Button } from '../components/shadcn/ui/button'
import { Collapsible } from '../components/shadcn/ui/collapsible'
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
                <Collapsible
                    key={period}
                    title={period}
                    items={chats.map(({ interactions, id }) => {
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
                                className="tw-truncate tw-px-2 hover:tw-bg-button-background-hover"
                            >
                                <MessageSquareTextIcon className="tw-inline-flex" size={13} />
                                <span className="tw-px-2 tw-truncate tw-w-full">{lastMessage}</span>
                            </Button>
                        )
                    })}
                />
            ))}
        </div>
    )
}
