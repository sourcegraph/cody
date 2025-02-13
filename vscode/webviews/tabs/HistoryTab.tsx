'use client'

import type { CodyIDE, UserLocalHistory } from '@sourcegraph/cody-shared'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { DownloadIcon, HistoryIcon, MessageSquarePlusIcon, Trash2Icon, TrashIcon } from 'lucide-react'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import type { WebviewType } from '../../src/chat/protocol'
import { LoadingDots } from '../chat/components/LoadingDots'
import { downloadChatHistory } from '../chat/downloadChatHistory'
import { Button } from '../components/shadcn/ui/button'
import { Command, CommandInput, CommandItem, CommandList } from '../components/shadcn/ui/command'
import { type VSCodeWrapper, getVSCodeAPI } from '../utils/VSCodeApi'
import styles from './HistoryTab.module.css'
import { View } from './types'
import { getCreateNewChatCommand } from './utils'

interface HistoryTabProps {
    IDE: CodyIDE
    setView: (view: View) => void
    webviewType?: WebviewType | undefined | null
    multipleWebviewsEnabled?: boolean | undefined | null
}

const HISTORY_ITEMS_PER_PAGE = 20

export const HistoryTab: React.FC<HistoryTabProps> = ({
    IDE,
    webviewType,
    multipleWebviewsEnabled,
    setView,
}) => {
    const userHistory = useUserHistory()
    const vscodeAPI = getVSCodeAPI()

    const chats = useMemo(() => {
        const history = userHistory ? Object.values(userHistory.chat) : userHistory
        return history?.filter(c => c.interactions.some(i => !!i.humanMessage?.text?.trim()))
    }, [userHistory])

    const handleStartNewChat = () => {
        vscodeAPI.postMessage({
            command: 'command',
            id: getCreateNewChatCommand({ IDE, webviewType, multipleWebviewsEnabled }),
        })
        setView(View.Chat)
    }

    return (
        <div className="tw-flex tw-overflow-auto tw-h-full tw-w-full">
            {!chats ? (
                <LoadingDots />
            ) : (
                <HistoryTabWithData
                    chats={chats}
                    handleStartNewChat={handleStartNewChat}
                    vscodeAPI={vscodeAPI}
                />
            )}
        </div>
    )
}

export const HistoryTabWithData: React.FC<{
    chats: UserLocalHistory['chat'][string][]
    handleStartNewChat: () => void
    vscodeAPI: VSCodeWrapper
}> = ({ chats, handleStartNewChat, vscodeAPI }) => {
    const [isDeleteAllActive, setIsDeleteAllActive] = useState<boolean>(false)

    const onDeleteButtonClick = useCallback(
        (id: string) => {
            vscodeAPI.postMessage({
                command: 'command',
                id: 'cody.chat.history.clear',
                arg: id,
            })
        },
        [vscodeAPI]
    )

    //add history search
    const [searchText, setSearchText] = useState('')
    const [currentPage, setCurrentPage] = useState(1)

    const filteredChats = useMemo(() => {
        const filtered = chats?.filter(c => c.interactions.some(i => !!i.humanMessage?.text?.trim()))
        const searchTerm = searchText.trim().toLowerCase()
        if (!searchTerm) {
            return filtered
        }
        //return the chats from nonEmptyChats where the humange messages contain the search term
        return filtered.filter(chat =>
            chat.interactions.some(c =>
                c.humanMessage?.text?.trim()?.toLowerCase()?.includes(searchTerm)
            )
        )
    }, [chats, searchText])

    const totalPages = Math.ceil(filteredChats.length / HISTORY_ITEMS_PER_PAGE)
    const paginatedChats = filteredChats.slice(
        (currentPage - 1) * HISTORY_ITEMS_PER_PAGE,
        currentPage * HISTORY_ITEMS_PER_PAGE
    )

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
            className="tw-flex tw-flex-col tw-h-full tw-py-4 tw-bg-transparent tw-px-2"
            disablePointerSelection={true}
        >
            <header className="tw-inline-flex tw-mt-4 tw-px-0">
                <Button
                    variant="secondary"
                    className="tw-bg-popover tw-border tw-border-border !tw-justify-between"
                    onClick={() => downloadChatHistory(useExtensionAPI())}
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
            {isDeleteAllActive && (
                <div
                    className="tw-my-4 tw-p-4 tw-mx-[0.5rem] tw-border tw-border-red-300 tw-rounded-lg tw-bg-red-50 dark:tw-bg-muted-transparent dark:tw-text-red-400 dark:tw-border-red-800"
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
                            className="tw-text-white tw-bg-red-800 hover:tw-bg-red-900 focus:tw-ring-4 focus:tw-outline-none focus:tw-ring-red-200 tw-font-medium tw-rounded-lg tw-text-xs tw-px-3 tw-py-1.5 tw-me-2 tw-text-center tw-inline-flex tw-items-center dark:tw-bg-red-600 dark:hover:tw-bg-red-700 dark:focus:tw-ring-red-800"
                            onClick={() => {
                                onDeleteButtonClick('clear-all-no-confirm')
                                setIsDeleteAllActive(false)
                            }}
                        >
                            Delete all chats
                        </Button>
                        <Button
                            size="sm"
                            className="tw-text-red-800 tw-bg-transparent tw-border tw-border-red-800 hover:tw-bg-red-900 hover:tw-text-white focus:tw-ring-4 focus:tw-outline-none focus:tw-ring-red-200 tw-font-medium tw-rounded-lg tw-text-xs tw-px-3 tw-py-1.5 tw-text-center dark:hover:tw-bg-red-600 dark:tw-border-red-600 dark:tw-text-red-400 dark:hover:tw-text-white dark:focus:tw-ring-red-800"
                            onClick={() => setIsDeleteAllActive(false)}
                            aria-label="Close"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
            <CommandList className="tw-flex-1">
                <CommandInput
                    value={searchText}
                    onValueChange={setSearchText}
                    placeholder="Search..."
                    autoFocus={true}
                    className="tw-m-[0.5rem] !tw-p-[0.5rem] tw-rounded tw-bg-[var(--vscode-input-background)] tw-text-[var(--vscode-input-foreground)] focus:tw-shadow-[0_0_0_0.125rem_var(--vscode-focusBorder)]"
                    disabled={chats.length === 0}
                />
                <div className="tw-flex-1 tw-overflow-y-auto tw-m-2">
                    {paginatedChats.map(({ interactions, id }) => {
                        const lastMessage =
                            interactions[interactions.length - 1]?.humanMessage?.text?.trim()
                        return (
                            <div key={id} className={`tw-flex tw-p-1 ${styles.historyRow}`}>
                                <CommandItem
                                    key={id}
                                    className={`tw-text-left tw-truncate tw-w-full tw-rounded-md tw-text-sm ${styles.historyItem} tw-max-w-[calc(100%-2rem)] tw-overflow-hidden`}
                                    onSelect={() =>
                                        vscodeAPI.postMessage({
                                            command: 'restoreHistory',
                                            chatID: id,
                                        })
                                    }
                                >
                                    <span className="tw-truncate tw-w-full">{lastMessage}</span>
                                </CommandItem>
                                <Button
                                    variant="ghost"
                                    title="Delete chat history"
                                    aria-label="delete-history-button"
                                    className={`${styles.historyDeleteBtn}`}
                                    onClick={() => onDeleteButtonClick(id)}
                                    onKeyDown={() => onDeleteButtonClick(id)}
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
            </CommandList>
            <footer className="tw-my-4 tw-border-muted-foreground tw-inline-flex tw-items-center tw-w-full tw-justify-center tw-gap-4">
                <Button
                    variant={'ghost'}
                    title="Previous page"
                    aria-label="Previous page"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    onKeyDown={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className={currentPage === 1 ? 'tw-opacity-75' : undefined}
                >
                    Prev
                </Button>
                <span className="tw-font-semibold tw-text-muted-foreground">{currentPage}</span>
                <span className="tw-text-xs">of</span>
                <span className="tw-font-semibold tw-text-muted-foreground">{totalPages}</span>
                <Button
                    variant="ghost"
                    title="Next"
                    aria-label="Next"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    onKeyDown={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className={currentPage === totalPages ? 'tw-opacity-75' : undefined}
                >
                    Next
                </Button>
            </footer>
        </Command>
    )
}

function useUserHistory(): UserLocalHistory | null | undefined {
    const userHistory = useExtensionAPI().userHistory
    return useObservable(useMemo(() => userHistory(), [userHistory])).value
}
