import type { CodyIDE, UserLocalHistory } from '@sourcegraph/cody-shared'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { HistoryIcon, MessageSquarePlusIcon, TrashIcon } from 'lucide-react'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import type { WebviewType } from '../../src/chat/protocol'
import { getRelativeChatPeriod } from '../../src/common/time-date'
import { LoadingDots } from '../chat/components/LoadingDots'
import { Button } from '../components/shadcn/ui/button'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { View } from './types'
import { getCreateNewChatCommand } from './utils'
import { Input } from '../components/shadcn/ui/input'

import styles from './HistoryTab.module.css'

interface HistoryTabProps {
    IDE: CodyIDE
    setView: (view: View) => void
    webviewType?: WebviewType | undefined | null
    multipleWebviewsEnabled?: boolean | undefined | null
}

export const HistoryTab: React.FC<HistoryTabProps> = props => {
    const userHistory = useUserHistory()


    const chats = useMemo(
        () => (userHistory ? Object.values(userHistory.chat) : userHistory),
        [userHistory]
    )

    return (
        <div className="tw-px-8 tw-pt-6 tw-pb-12">
            {chats === undefined ? (
                <LoadingDots />
            ) : chats === null ? (
                <p>History is not available.</p>
            ) : (
                <HistoryTabWithData {...props} chats={chats} />
            )}
        </div>
    )
}

export const HistoryTabWithData: React.FC<
    HistoryTabProps & { chats: UserLocalHistory['chat'][string][] }
> = ({ IDE, webviewType, multipleWebviewsEnabled, setView, chats }) => {
    const nonEmptyChats = useMemo(() => chats.filter(chat => chat.interactions.length > 0), [chats])

    const onDeleteButtonClick = useCallback(
        (id: string) => {
            if (chats.find(chat => chat.id === id)) {
                getVSCodeAPI().postMessage({
                    command: 'command',
                    id: 'cody.chat.history.clear',
                    arg: id,
                })
            }
        },
        [chats]
    )

    const handleStartNewChat = () => {
        getVSCodeAPI().postMessage({
            command: 'command',
            id: getCreateNewChatCommand({ IDE, webviewType, multipleWebviewsEnabled }),
        })
        setView(View.Chat)
    }

    //add history search
    const [searchText, setSearchText] = useState('')

    const filteredChats = useMemo(() => {
        const searchTerm = searchText.trim().toLowerCase()
        if (!searchTerm) {
            return nonEmptyChats
        }
        console.log(searchTerm)
        //return the chats from nonEmptyChats where the humange messages contain the search term
        return nonEmptyChats.filter(chat => {
            return chat.interactions.some(c => {
                return c.humanMessage?.text?.trim()?.toLowerCase()?.includes(searchTerm)
            })
        })
    }, [nonEmptyChats, searchText])

    const sortedChatsByPeriod = useMemo(() =>
        Array.from(
            filteredChats
                .filter(chat => chat.interactions.length)
                .reverse()
                .reduce((acc, chat) => {
                    const period = getRelativeChatPeriod(new Date(chat.lastInteractionTimestamp))
                    acc.set(period, [...(acc.get(period) || []), chat])
                    return acc
                }, new Map<string, typeof filteredChats>())
        ),
        [filteredChats]
    )

    return (
        <div className="tw-flex tw-flex-col">

            <div className="tw-flex tw-py-2">
                <Input
                    className="tw-flex-1 tw-h-12 tw-py-3 tw-border-none tw-text-sm"
                    placeholder="Search chat history"
                    value={searchText}
                    onChange={event => setSearchText(event.target.value)}
                />
            </div>

            {sortedChatsByPeriod.map(([period, chats]) => (
                <div key={period} className="tw-flex tw-flex-col">
                    <h4 className="tw-font-semibold tw-text-muted-foreground tw-py-2 tw-my-3">{period}</h4>
                    {chats.map(({ interactions, id }) => {
                        const lastMessage = interactions[interactions.length - 1]?.humanMessage?.text?.trim()
                        return (
                            <div key={id} className={`tw-flex tw-flex-row tw-p-1 ${styles.historyRow}`}>
                                <div
                                    onClick={() =>
                                        getVSCodeAPI().postMessage({
                                            command: 'restoreHistory',
                                            chatID: id,
                                        })
                                    }
                                    className={`tw-text-left tw-truncate tw-w-full ${styles.historyItem}`}
                                >
                                    <span className="tw-truncate tw-w-full">{lastMessage}</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    title="Delete chat"
                                    className={`${styles.historyDeleteBtn}`}
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
                </div>
            ))}

            {nonEmptyChats.length === 0 && (
                <div className="tw-flex tw-flex-col tw-items-center tw-mt-6">
                    <HistoryIcon
                        size={20}
                        strokeWidth={1.25}
                        className="tw-mb-5 tw-text-muted-foreground"
                    />

                    <span className="tw-text-lg tw-mb-4 tw-text-muted-foreground">
                        You have no chat history
                    </span>

                    <span className="tw-text-sm tw-text-muted-foreground tw-mb-8">
                        Explore all your previous chats here. Track and <br /> search through what you've
                        been working on.
                    </span>

                    <Button
                        size="sm"
                        variant="secondary"
                        aria-label="Start a new chat"
                        className="tw-px-4 tw-py-2"
                        onClick={handleStartNewChat}
                    >
                        <MessageSquarePlusIcon size={16} className="tw-w-8 tw-h-8" strokeWidth={1.25} />
                        Start a new chat
                    </Button>
                </div>
            )}
        </div>
    )}

function useUserHistory(): UserLocalHistory | null | undefined {
    const userHistory = useExtensionAPI().userHistory
    return useObservable(useMemo(() => userHistory(), [userHistory])).value
}
