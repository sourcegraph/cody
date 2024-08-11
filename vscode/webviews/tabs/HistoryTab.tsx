import type { SerializedChatTranscript } from '@sourcegraph/cody-shared'
import { MessageSquareTextIcon, TrashIcon } from 'lucide-react'
import { useCallback, useMemo } from 'react'
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

    const onDeleteButtonClick = useCallback(
        (id: string) => {
            if (userHistory.find(chat => chat.id === id)) {
                getVSCodeAPI().postMessage({
                    command: 'command',
                    id: 'cody.chat.history.clear',
                    arg: id,
                })
            }
        },
        [userHistory]
    )

    return (
        <div className="tw-overflow-auto tw-px-8 tw-pt-6 tw-pb-12 tw-flex tw-flex-col tw-gap-10">
            {Array.from(chatByPeriod, ([period, chats]) => (
                <CollapsiblePanel
                    key={period}
                    storageKey={`history.${period}`}
                    title={period}
                    initialOpen={true}
                >
                    {chats.map(({ interactions, id }) => {
                        const lastMessage =
                            interactions[interactions.length - 1]?.humanMessage?.text?.trim()
                        return (
                            <div key={id} className="tw-inline-flex tw-justify-between">
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
                                        className="tw-w-8 tw-h-8 tw-opacity-80"
                                        size={16}
                                        strokeWidth="1.25"
                                    />
                                    <span className="tw-truncate tw-w-full">{lastMessage}</span>
                                </Button>
                                <Button
                                    key={id}
                                    variant="ghost"
                                    title="Delete chat"
                                    onClick={() => onDeleteButtonClick(id)}
                                >
                                    <TrashIcon
                                        className="tw-w-8 tw-h-8 tw-opacity-80"
                                        size={16}
                                        strokeWidth="1.25"
                                    />
                                </Button>
                            </div>
                        )
                    })}
                </CollapsiblePanel>
            ))}
        </div>
    )
}
