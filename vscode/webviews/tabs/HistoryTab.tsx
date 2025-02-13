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

const HISTORY_ITEMS_PER_PAGE = 15

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
        <div className="tw-overflow-auto tw-h-full tw-p4">
            <div className="tw-flex tw-flex-col tw-items-center">
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
        (id?: string) => {
            if (chats === undefined || chats.find(chat => chat.id === id)) {
                vscodeAPI.postMessage({
                    command: 'command',
                    id: 'cody.chat.history.clear',
                    arg: id,
                })
            }
        },
        [chats, vscodeAPI]
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
            <div className="tw-flex tw-flex-col tw-items-center">
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
            className="tw-flex tw-flex-col tw-h-full tw-py-4 tw-bg-transparent tw-gap-4"
            disablePointerSelection={true}
        >
            <header className="tw-px-6 tw-inline-flex">
                <Button
                    variant="secondary"
                    className={'tw-bg-popover tw-border tw-border-border !tw-justify-between'}
                    onClick={() => downloadChatHistory(useExtensionAPI())}
                >
                    <div className="tw-flex tw-items-center">
                        <DownloadIcon size={16} className="tw-mr-3" /> Export
                    </div>
                </Button>
                <Button
                    variant="secondary"
                    className={'tw-bg-popover tw-border tw-border-border !tw-justify-between'}
                    onClick={() => setIsDeleteAllActive(true)}
                >
                    <div className="tw-flex tw-items-center">
                        <Trash2Icon size={16} className="tw-mr-3" /> Delete all
                    </div>
                </Button>
                {isDeleteAllActive && (
                    <div className="tw-flex tw-gap-2">
                        <Button
                            variant="secondary"
                            className={'tw-bg-popover tw-border tw-border-border tw-text-sm'}
                            onClick={() => setIsDeleteAllActive(false)}
                            size="sm"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            className={'tw-bg-popover tw-border tw-border-border tw-text-sm'}
                            onClick={() => {
                                onDeleteButtonClick(undefined)
                                setIsDeleteAllActive(false)
                            }}
                            size="sm"
                        >
                            Confirm Delete
                        </Button>
                    </div>
                )}
            </header>
            <CommandList className="tw-sticky tw-top-0 tw-z-10 tw-p-2">
                <CommandInput
                    value={searchText}
                    onValueChange={setSearchText}
                    placeholder="Search..."
                    autoFocus={true}
                    className="tw-m-[0.5rem] !tw-p-[0.5rem] tw-rounded tw-bg-input-background tw-text-input-foreground focus:tw-shadow-[0_0_0_0.125rem_var(--vscode-focusBorder)]"
                    disabled={chats.length === 0}
                />
                <div className="tw-flex-1 tw-overflow-y-auto">
                    {paginatedChats.map(({ interactions, id }) => {
                        const lastMessage =
                            interactions[interactions.length - 1]?.humanMessage?.text?.trim()
                        return (
                            <div key={id} className={`tw-flex tw-p-1 ${styles.historyRow}`}>
                                <CommandItem
                                    key={id}
                                    className={`tw-text-left tw-truncate tw-w-full tw-rounded-md tw-text-sm ${styles.historyItem}`}
                                    onSelect={() =>
                                        vscodeAPI.postMessage({
                                            command: 'restoreHistory',
                                            chatID: id,
                                        })
                                    }
                                >
                                    {lastMessage}
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
            {totalPages > 1 && (
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
                    <span className="tw-text-sm">of</span>
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
            )}
        </Command>
    )
}

function useUserHistory(): UserLocalHistory | null | undefined {
    const userHistory = useExtensionAPI().userHistory
    return useObservable(useMemo(() => userHistory(), [userHistory])).value
}
