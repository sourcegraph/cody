import type { CodyIDE, ChatMessage, Model } from '@sourcegraph/cody-shared'
import type { FunctionComponent } from 'react'
import { useMemo, useRef } from 'react'
import { Chat } from '../../Chat'
import { useUserHistory } from '../../../src/chat/utils'
import { type VSCodeWrapper } from '../../utils/VSCodeApi'
import { View } from '../../tabs/types'
import type { WebviewType } from '../../../src/chat/protocol'
import { getRelativeChatPeriod } from '../../../src/common/time-date'
import { TrashIcon, HistoryIcon } from 'lucide-react'
import { Button } from '../../components/shadcn/ui/button'

import { getVSCodeAPI } from '../../utils/VSCodeApi'
import { getCreateNewChatCommand } from '../../tabs/utils'
import type { Guardrails } from '@sourcegraph/cody-shared'

import styles from './ChatWithHistorySidebar.module.css'

interface ChatWithHistorySidebarProps {
    messageInProgress: ChatMessage | null
    transcript: ChatMessage[]
    models: Model[]
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
    chatEnabled: boolean
    guardrails?: Guardrails
    scrollableParent?: HTMLElement | null
    showWelcomeMessage?: boolean
    showIDESnippetActions?: boolean
    setView: (view: View) => void
    smartApplyEnabled?: boolean
    isWorkspacesUpgradeCtaEnabled?: boolean
    IDE: CodyIDE
    webviewType?: WebviewType | undefined | null
    multipleWebviewsEnabled?: boolean | undefined | null
    isWideLayout: boolean
}

export const ChatWithHistorySidebar: FunctionComponent<ChatWithHistorySidebarProps> = ({
    messageInProgress,
    transcript,
    models,
    vscodeAPI,
    chatEnabled,
    guardrails,
    scrollableParent,
    showWelcomeMessage,
    showIDESnippetActions,
    setView,
    smartApplyEnabled,
    isWorkspacesUpgradeCtaEnabled,
    IDE,
    webviewType,
    multipleWebviewsEnabled,
    isWideLayout,
}) => {
    const userHistory = useUserHistory()
    const containerRef = useRef<HTMLDivElement>(null)

    const chats = useMemo(
        () => (userHistory ? Object.values(userHistory.chat) : userHistory),
        [userHistory]
    )

    const nonEmptyChats = useMemo(
        () => (chats ? chats.filter(chat => chat.interactions.length > 0) : []),
        [chats]
    )

    const sortedChatsByPeriod = useMemo(
        () =>
            Array.from(
                nonEmptyChats
                    .filter(chat => chat.interactions.length)
                    .reverse()
                    .reduce((acc, chat) => {
                        const period = getRelativeChatPeriod(new Date(chat.lastInteractionTimestamp))
                        acc.set(period, [...(acc.get(period) || []), chat])
                        return acc
                    }, new Map<string, typeof nonEmptyChats>())
            ),
        [nonEmptyChats]
    )

    const onDeleteButtonClick = (id: string): void => {
        if (chats?.find(chat => chat.id === id)) {
            getVSCodeAPI().postMessage({
                command: 'command',
                id: 'cody.chat.history.clear',
                arg: id,
            })
        }
    }

    const handleStartNewChat = (): void => {
        getVSCodeAPI().postMessage({
            command: 'command',
            id: getCreateNewChatCommand({ IDE, webviewType, multipleWebviewsEnabled }),
        })
        setView(View.Chat)
        // No need to set active tab anymore
    }

    // No need for ResizeObserver anymore as we get isWideLayout from props

    // Render the history list component
    const renderHistoryList = () => (
        <div className={styles.historyList}>
            {chats === undefined ? (
                <div className="tw-flex tw-justify-center tw-items-center tw-h-full">
                    <span className="tw-text-muted-foreground">Loading...</span>
                </div>
            ) : chats === null ? (
                <div className="tw-flex tw-justify-center tw-items-center tw-h-full">
                    <span className="tw-text-muted-foreground">History is not available.</span>
                </div>
            ) : (
                <>
                    {nonEmptyChats.length === 0 ? (
                        <div className="tw-flex tw-flex-col tw-items-center tw-mt-6">
                            <HistoryIcon
                                size={16}
                                strokeWidth={1.25}
                                className="tw-mb-3 tw-text-muted-foreground"
                            />
                            <span className="tw-text-sm tw-mb-2 tw-text-muted-foreground">
                                No chat history
                            </span>
                            <Button
                                size="sm"
                                variant="outline"
                                aria-label="Start a new chat"
                                className="tw-px-2 tw-py-1 tw-text-xs"
                                onClick={handleStartNewChat}
                            >
                                New chat
                            </Button>
                        </div>
                    ) : (
                        sortedChatsByPeriod.map(([period, periodChats]) => (
                            <div key={period} className="tw-flex tw-flex-col">
                                <h4 className="tw-font-semibold tw-text-muted-foreground tw-py-1 tw-text-xs">
                                {period}
                                </h4>
                                {periodChats.map(chat => {
                                    const id = chat.lastInteractionTimestamp
                                    const interactions = chat.interactions
                                    const chatTitle = chat.chatTitle
                                    const lastMessage =
                                        interactions[interactions.length - 1]?.humanMessage?.text?.trim()
                                    return (
                                        <div
                                            key={id}
                                            className={`tw-flex tw-flex-row tw-p-1 ${styles.historyRow}`}
                                        >
                                            <Button
                                                variant="ghost"
                                                className={`tw-text-left tw-truncate tw-w-full ${styles.historyItem}`}
                                                onClick={() => {
                                                    getVSCodeAPI().postMessage({
                                                        command: 'restoreHistory',
                                                        chatID: id,
                                                    })
                                                    // No need to handle tab switching anymore
                                                }}
                                            >
                                                <span className="tw-truncate tw-w-full">
                                                    {chatTitle || lastMessage}
                                                </span>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                title="Delete chat"
                                                aria-label="Delete chat"
                                                className={`${styles.historyDeleteBtn} tw-p-0 tw-h-auto`}
                                                onClick={() => onDeleteButtonClick(id)}
                                            >
                                                <TrashIcon
                                                className="tw-w-5 tw-h-5 tw-opacity-80"
                                                size={16}
                                                strokeWidth="1.25"
                                                />
                                            </Button>
                                        </div>
                                    )
                                })}
                            </div>
                        ))
                    )}
                </>
            )}
        </div>
    )

    // Render the chat component
    const renderChat = () => (
        <Chat
            messageInProgress={messageInProgress}
            transcript={transcript}
            models={models}
            vscodeAPI={vscodeAPI}
            chatEnabled={chatEnabled}
            guardrails={guardrails}
            scrollableParent={scrollableParent}
            showWelcomeMessage={showWelcomeMessage}
            showIDESnippetActions={showIDESnippetActions}
            setView={setView}
            smartApplyEnabled={smartApplyEnabled}
            isWorkspacesUpgradeCtaEnabled={isWorkspacesUpgradeCtaEnabled}
        />
    )

    // In narrow layout, just show the chat without the history sidebar
    // The history will be accessed via the TabsBar navigation
    if (!isWideLayout) {
        return (
            <div className={styles.container} ref={containerRef}>
                <div className={styles.fullWidthChatContainer}>
                    {renderChat()}
                </div>
            </div>
        )
    }

    // Render side-by-side layout for wider screens
    return (
        <div className={styles.container} ref={containerRef}>
            <div className={styles.chatContainer}>
                {renderChat()}
            </div>
            <div className={styles.historyContainer}>
                <div className={styles.historyHeader}>
                    <h3 className="tw-font-semibold tw-text-foreground tw-text-sm">Chat History</h3>
                </div>
                {renderHistoryList()}
            </div>
        </div>
    )
}