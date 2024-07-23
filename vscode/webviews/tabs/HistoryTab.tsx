import type { SerializedChatTranscript } from '@sourcegraph/cody-shared'
import { MessageSquareTextIcon } from 'lucide-react'
import { useMemo } from 'react'
import { getRelativeChatPeriod } from '../../src/common/time-date'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
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
        <div className="tw-flex tw-flex-col tw-gap-8 tw-px-8">
            {Array.from(chatByPeriod, ([period, chats]) => (
                <CollapsiblePanel key={period} title={period}>
                    {chats.map(({ interactions, id }) => {
                        const lastMessage =
                            interactions[interactions.length - 1]?.humanMessage?.text?.trim()
                        return (
                            <Button
                                key={id}
                                variant="ghost"
                                title={lastMessage}
                                onClick={() =>
                                    getVSCodeAPI().postMessage({
                                        command: 'restoreHistory',
                                        chatID: id,
                                    })
                                }
                                className="tw-text-left tw-truncate"
                            >
                                <MessageSquareTextIcon
                                    className="tw-w-8 tw-h-8"
                                    size={16}
                                    strokeWidth="1.25"
                                />
                                <span className="tw-truncate tw-w-full">{lastMessage}</span>
                            </Button>
                        )
                    })}
                </CollapsiblePanel>
            ))}
        </div>
    )
}
