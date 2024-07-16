import type { SerializedChatTranscript } from '@sourcegraph/cody-shared'
import { MessageSquareTextIcon } from 'lucide-react'
import { useMemo } from 'react'
import { getRelativeChatPeriod } from '../../src/common/time-date'
import { getVSCodeAPI } from '../utils/VSCodeApi'

interface HistoryViewProps {
    userHistory: SerializedChatTranscript[]
}

export const HistoryView: React.FC<HistoryViewProps> = ({ userHistory }) => {
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
        <div className="tw-container tw-mx-auto tw-flex tw-flex-col tw-px-8 tw-pt-4">
            {Array.from(chatByPeriod, ([period, chats]) => (
                <div key={period}>
                    <p className="tw-mt-2">{period}</p>
                    <div
                        className="tw-container tw-mx-auto tw-flex tw-flex-col tw-truncate"
                        key={period}
                    >
                        {chats.map(({ interactions, id }) => {
                            const lastMessage =
                                interactions[interactions.length - 1]?.humanMessage?.text?.trim()
                            return (
                                <button
                                    key={id}
                                    onClick={() =>
                                        getVSCodeAPI().postMessage({
                                            command: 'restoreHistory',
                                            chatID: id,
                                        })
                                    }
                                    type="button"
                                    className="tw-flex tw-border tw-border-border tw-bg-transparent hover:tw-bg-muted-transparent hover:tw-text-muted-foreground tw-py-1 tw-items-end tw-border-none tw-opacity-50 hover:tw-opacity-100 tw-transition-all tw-justify-start"
                                    title={lastMessage}
                                >
                                    <span className="tw-truncate tw-text-sm">
                                        <MessageSquareTextIcon className="tw-inline-flex" size={13} />
                                        <span className="tw-px-2">{lastMessage}</span>
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}
