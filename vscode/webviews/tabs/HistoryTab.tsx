import type { CodyIDE, SerializedChatTranscript } from '@sourcegraph/cody-shared'
import { HistoryIcon, MessageSquarePlusIcon, MessageSquareTextIcon, TrashIcon } from 'lucide-react'
import type React from 'react'
import { useCallback, useMemo } from 'react'
import type { WebviewType } from '../../src/chat/protocol'
import { getRelativeChatPeriod } from '../../src/common/time-date'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { Button } from '../components/shadcn/ui/button'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { View } from './types'
import { getCreateNewChatCommand } from './utils'

interface HistoryTabProps {
    IDE: CodyIDE
    setView: (view: View) => void
    userHistory: SerializedChatTranscript[]
    webviewType?: WebviewType | undefined | null
    multipleWebviewsEnabled?: boolean | undefined | null
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
    userHistory,
    IDE,
    webviewType,
    multipleWebviewsEnabled,
    setView,
}) => {
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

    const handleStartNewChat = () => {
        getVSCodeAPI().postMessage({
            command: 'command',
            id: getCreateNewChatCommand({ IDE, webviewType, multipleWebviewsEnabled }),
        })
        setView(View.Chat)
    }

    const historyDataUrl = useMemo(() => {
        const json = JSON.stringify(userHistory, null, 2)
        return `data:application/json;charset=utf-8,${encodeURIComponent(json)}`
    }, [userHistory])
    const historyBlobUrl = useMemo(() => {
        const json = JSON.stringify(userHistory, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        // Create a temporary URL for the Blob
        return window.URL.createObjectURL(blob)
    }, [userHistory])

    const handleDownloadData = () => {
        const json = JSON.stringify(userHistory, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'cody-history-data.json'
        link.click()
        window.URL.revokeObjectURL(url)
    }
    const handleDownloadBlob = () => {
        const json = JSON.stringify(userHistory, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'cody-history-blob.json'
        link.click()
        window.URL.revokeObjectURL(url)
    }

    const getDownloadDataUri = (): string => {
        const json = JSON.stringify(userHistory, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = window.URL.createObjectURL(blob)
        return url
    }
    const getDownloadBlobUri = (): string => {
        const json = JSON.stringify(userHistory, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = window.URL.createObjectURL(blob)
        return url
    }

    const chats = Array.from(chatByPeriod)

    return (
        <div className="tw-px-8 tw-pt-6 tw-pb-12 tw-flex tw-flex-col tw-gap-10">
            <div>
                <a
                    className="tw-p-2"
                    href={historyDataUrl}
                    download="cody-history-data-test.json"
                    target="_blank"
                    rel="noreferrer"
                >
                    Example 1: Chat History Data Link
                </a>
                <a
                    className="tw-p-2"
                    href={historyBlobUrl}
                    download="cody-history-blob-test.json"
                    target="_blank"
                    rel="noreferrer"
                >
                    Example 2: Chat History Blob Link
                </a>
                <button className="tw-p-2" onClick={handleDownloadData} type="button">
                    Example 3: Chat History Data Button
                </button>
                <button className="tw-p-2" onClick={handleDownloadBlob} type="button">
                    Example 4: Chat History Blob Button
                </button>
                <a
                    className="tw-p-2"
                    href={getDownloadDataUri()}
                    download="cody-history-data.json"
                    onClick={event => {
                        event.preventDefault()
                        window.URL.revokeObjectURL(event.currentTarget.href)
                    }}
                    target="_blank"
                    rel="noreferrer"
                >
                    Example 5: Chat History Data Link
                </a>
                <a
                    className="tw-p-2"
                    href={getDownloadBlobUri()}
                    download="cody-history-blob.json"
                    onClick={event => {
                        event.preventDefault()
                        window.URL.revokeObjectURL(event.currentTarget.href)
                    }}
                    target="_blank"
                    rel="noreferrer"
                >
                    Example 6: Chat History Blob Link
                </a>
            </div>
            {chats.map(([period, chats]) => (
                <CollapsiblePanel
                    id={`history-${period}`.replaceAll(' ', '-').toLowerCase()}
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
                                    className="tw-text-left tw-truncate tw-w-full"
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

            {chats.length === 0 && (
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
                        Explore all your previous chats here. Track and <br /> search through what you’ve
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
    )
}
