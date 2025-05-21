;('use client')

import { CodyIDE, type WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import type { LightweightChatTranscript } from '@sourcegraph/cody-shared/src/chat/transcript'
import { DownloadIcon, HistoryIcon, MessageSquarePlusIcon, Trash2Icon, TrashIcon } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WebviewType } from '../../src/chat/protocol'
import { LoadingDots } from '../chat/components/LoadingDots'
import { downloadChatHistory } from '../chat/downloadChatHistory'
import { Button } from '../components/shadcn/ui/button'
import { Command, CommandInput, CommandItem, CommandList } from '../components/shadcn/ui/command'
import { useUserHistory } from '../components/useUserHistory'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import styles from './HistoryTab.module.css'
import { View } from './types'
import { getCreateNewChatCommand } from './utils'

interface HistoryTabProps {
    IDE: CodyIDE
    setView: (view: View) => void
    webviewType?: WebviewType | undefined | null
    multipleWebviewsEnabled?: boolean | undefined | null
    extensionAPI: WebviewToExtensionAPI
}

const HISTORY_ITEMS_PER_PAGE = 20

export const HistoryTab: React.FC<HistoryTabProps> = ({
    IDE,
    webviewType,
    multipleWebviewsEnabled,
    setView,
    extensionAPI,
}) => {
    const userHistory = useUserHistory()

    const chats = useMemo(() => (userHistory ? Object.values(userHistory) : userHistory), [userHistory])

    return (
        <div className="tw-flex tw-flex-col tw-justify-center tw-overflow-hidden tw-h-full tw-w-full tw-m-4">
            {!chats ? (
                <LoadingDots />
            ) : (
                <HistoryTabWithData
                    chats={[...chats].reverse()}
                    extensionAPI={extensionAPI}
                    IDE={IDE}
                    setView={setView}
                    webviewType={webviewType}
                    multipleWebviewsEnabled={multipleWebviewsEnabled}
                />
            )}
        </div>
    )
}

export const HistoryTabWithData: React.FC<HistoryTabProps & { chats: LightweightChatTranscript[] }> = ({
    IDE,
    webviewType,
    multipleWebviewsEnabled,
    setView,
    chats,
    extensionAPI,
}) => {
    const vscodeAPI = getVSCodeAPI()
    const nonEmptyChats = useMemo(() => chats.filter(c => c?.firstHumanMessageText?.length), [chats])

    const [isDeleteAllActive, setIsDeleteAllActive] = useState<boolean>(false)
    const [deletingChatIds, setDeletingChatIds] = useState<Set<string>>(new Set())

    //add history search
    const [searchText, setSearchText] = useState('')
    const [visibleItems, setVisibleItems] = useState(HISTORY_ITEMS_PER_PAGE)
    const [isLoading, setIsLoading] = useState(false)
    const observerRef = useRef<IntersectionObserver | null>(null)
    const loadingRef = useRef<HTMLDivElement>(null)

    const filteredChats = useMemo(() => {
        const searchTerm = searchText.trim().toLowerCase()
        if (!searchTerm) {
            return nonEmptyChats
        }
        // Search in chat titles or first message text
        return nonEmptyChats.filter(chat => {
            // Search in chat title if available
            if (chat.chatTitle?.toLowerCase().includes(searchTerm)) {
                return true
            }
            // Search in first message text if available
            return chat.firstHumanMessageText?.toLowerCase().includes(searchTerm) || false
        })
    }, [nonEmptyChats, searchText])

    const hasMoreItems = visibleItems < filteredChats.length
    const displayedChats = filteredChats.slice(0, visibleItems)

    const onDeleteButtonClick = useCallback(
        (e: React.MouseEvent | React.KeyboardEvent, id: string) => {
            e.preventDefault()
            e.stopPropagation()

            // Mark this chat as being deleted to show UI feedback immediately
            setDeletingChatIds(prev => {
                const newSet = new Set(prev)
                newSet.add(id)
                return newSet
            })

            // Send the delete command to the extension
            vscodeAPI.postMessage({
                command: 'command',
                id: 'cody.chat.history.clear',
                arg: id,
            })

            // For "delete all" we want to clear the state immediately
            if (id === 'clear-all-no-confirm') {
                // Clear visible items to prevent empty slots
                setVisibleItems(prev => Math.min(prev, filteredChats.length - deletingChatIds.size))
            }
        },
        [vscodeAPI, filteredChats.length, deletingChatIds]
    )

    const handleStartNewChat = () => {
        getVSCodeAPI().postMessage({
            command: 'command',
            id: getCreateNewChatCommand({ IDE, webviewType, multipleWebviewsEnabled }),
        })
        setView(View.Chat)
    }

    const onExportClick = useCallback(() => downloadChatHistory(extensionAPI), [extensionAPI])

    // Reset visible items when search changes
    useEffect(() => {
        setVisibleItems(HISTORY_ITEMS_PER_PAGE)
    }, [])

    // Listen for deletion confirmations from the extension
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data
            if (message.type === 'deletionComplete' && message.chatID) {
                // Remove from deletingChatIds once we get confirmation
                setDeletingChatIds(prev => {
                    const newSet = new Set(prev)
                    newSet.delete(message.chatID)
                    return newSet
                })
            }
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [])

    // Update visible items when items are deleted to prevent gaps
    useEffect(() => {
        if (deletingChatIds.size > 0) {
            // Adjust visible items to prevent empty spaces
            setVisibleItems(prev => {
                const newVisibleItems = Math.min(
                    prev,
                    filteredChats.length + Math.min(HISTORY_ITEMS_PER_PAGE, deletingChatIds.size)
                )
                return Math.max(HISTORY_ITEMS_PER_PAGE, newVisibleItems)
            })
        }
    }, [deletingChatIds.size, filteredChats.length])

    useEffect(() => {
        const loadMoreItems = () => {
            if (hasMoreItems && !isLoading) {
                setIsLoading(true)
                // Simulate loading delay for better UX
                setTimeout(() => {
                    setVisibleItems(prev =>
                        Math.min(prev + HISTORY_ITEMS_PER_PAGE, filteredChats.length)
                    )
                    setIsLoading(false)
                }, 300)
            }
        }

        // Create intersection observer
        observerRef.current = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    loadMoreItems()
                }
            },
            { threshold: 0.1 }
        )

        // Observe the loading element
        if (loadingRef.current && hasMoreItems) {
            observerRef.current.observe(loadingRef.current)
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect()
            }
        }
    }, [hasMoreItems, filteredChats.length, isLoading])

    if (!filteredChats.length && !searchText) {
        return (
            <div className="tw-flex tw-flex-col tw-items-center tw-p-6">
                <HistoryIcon size={20} strokeWidth={1.25} className="tw-mb-5 tw-text-muted-foreground" />

                <span className="tw-text-lg tw-mb-4 tw-text-muted-foreground">
                    You have no chat history
                </span>

                <span className="tw-text-sm tw-text-muted-foreground tw-mb-8 tw-text-center">
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
                    <MessageSquarePlusIcon
                        size={16}
                        className="tw-w-4 tw-h-4 tw-mr-2"
                        strokeWidth={1.25}
                    />
                    Start a new chat
                </Button>
            </div>
        )
    }

    return (
        <Command
            loop={true}
            tabIndex={0}
            shouldFilter={false}
            defaultValue="empty"
            className="tw-flex tw-flex-col tw-h-full tw-py-4 tw-bg-transparent tw-px-2 tw-mb-4 tw-overscroll-auto"
            disablePointerSelection={true}
        >
            {IDE !== CodyIDE.Web && (
                <header className="tw-inline-flex tw-px-4 tw-gap-4">
                    <Button
                        variant="secondary"
                        className="tw-bg-popover tw-border tw-border-border !tw-justify-between"
                        onClick={onExportClick}
                    >
                        <div className="tw-flex tw-items-center">
                            <DownloadIcon size={16} className="tw-mr-3" /> Export
                        </div>
                    </Button>
                    <Button
                        variant="secondary"
                        className="tw-bg-popover tw-border tw-border-border !tw-justify-between"
                        onClick={() => setIsDeleteAllActive(true)}
                    >
                        <div className="tw-flex tw-items-center">
                            <Trash2Icon size={16} className="tw-mr-3" /> Delete all
                        </div>
                    </Button>
                </header>
            )}
            {isDeleteAllActive && (
                <div
                    className="tw-my-4 tw-p-4 tw-mx-[0.5rem] tw-border tw-border-red-300 tw-rounded-lg tw-bg-muted-transparent dark:tw-text-red-400 dark:tw-border-red-800"
                    role="alert"
                >
                    <div className="tw-flex tw-items-center">
                        <h3 className="tw-text-lg tw-font-medium">
                            Are you sure you want to delete all of your chats?
                        </h3>
                    </div>
                    <div className="tw-mt-2 tw-mb-4 tw-text-sm tw-text-muted-foreground">
                        You will not be able to recover them once deleted.
                    </div>
                    <div className="tw-flex">
                        <Button
                            size="sm"
                            aria-label="Delete all chats"
                            className="tw-text-white tw-bg-red-800 hover:tw-bg-red-900 focus:tw-ring-4 focus:tw-outline-none focus:tw-ring-red-200 tw-font-medium tw-rounded-lg tw-text-xs tw-px-3 tw-py-1.5 tw-me-2 tw-text-center tw-inline-flex tw-items-center dark:tw-bg-red-600 dark:hover:tw-bg-red-700 dark:focus:tw-ring-red-800"
                            onClick={e => {
                                onDeleteButtonClick(e, 'clear-all-no-confirm')
                                setIsDeleteAllActive(false)
                            }}
                        >
                            Delete all chats
                        </Button>
                        <Button
                            size="sm"
                            className="tw-text-red-800 tw-bg-transparent tw-border tw-border-red-800 hover:tw-bg-red-900 hover:tw-text-white focus:tw-ring-4 focus:tw-outline-none focus:tw-ring-red-200 tw-font-medium tw-rounded-lg tw-text-xs tw-px-3 tw-py-1.5 tw-text-center dark:hover:tw-bg-red-600 dark:tw-border-red-600 dark:tw-text-red-400 dark:hover:tw-text-white dark:focus:tw-ring-red-800"
                            onClick={() => setIsDeleteAllActive(false)}
                            aria-label="Cancel"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
            <CommandList>
                <CommandInput
                    value={searchText}
                    onValueChange={setSearchText}
                    placeholder="Search..."
                    autoFocus={true}
                    className="tw-m-[0.5rem] !tw-p-[0.5rem] tw-rounded tw-bg-input-background tw-text-input-foreground focus:tw-shadow-[0_0_0_0.125rem_var(--vscode-focusBorder)]"
                    disabled={chats.length === 0}
                />
            </CommandList>
            <CommandList className="tw-flex-1 tw-overflow-y-auto tw-m-2">
                {displayedChats.map((chat: LightweightChatTranscript) => {
                    const id = chat.lastInteractionTimestamp
                    const chatTitle = chat.chatTitle
                    const lastMessage = chat.firstHumanMessageText
                    // Show the last interaction timestamp in a human-readable format
                    const timestamp = new Date(chat.lastInteractionTimestamp)
                        .toLocaleString()
                        .replace('T', ', ')
                        .replace('Z', '')

                    return (
                        <CommandItem
                            key={id}
                            className={`tw-text-left tw-truncate tw-w-full tw-rounded-md tw-text-sm ${styles.historyItem} tw-overflow-hidden tw-text-sidebar-foreground tw-align-baseline`}
                            onSelect={() =>
                                vscodeAPI.postMessage({
                                    command: 'restoreHistory',
                                    chatID: id,
                                })
                            }
                        >
                            <div className="tw-truncate tw-w-full tw-flex tw-flex-col tw-gap-2">
                                <div>{chatTitle || lastMessage}</div>
                                <div className="tw-text-left tw-text-muted-foreground">{timestamp}</div>
                            </div>
                            <Button
                                variant="outline"
                                title="Delete chat history"
                                aria-label="delete-history-button"
                                className={styles.deleteButton}
                                onClick={e => onDeleteButtonClick(e, id)}
                                onKeyDown={e => onDeleteButtonClick(e, id)}
                            >
                                <TrashIcon className="tw-w-8 tw-h-8" size={16} strokeWidth="1.25" />
                            </Button>
                        </CommandItem>
                    )
                })}
                {hasMoreItems && (
                    <div ref={loadingRef} className="tw-flex tw-justify-center tw-items-center tw-py-4">
                        {isLoading ? (
                            <LoadingDots />
                        ) : (
                            <span className="tw-text-sm tw-text-muted-foreground">Scroll for more</span>
                        )}
                    </div>
                )}
            </CommandList>
        </Command>
    )
}
