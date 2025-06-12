import { CodyIDE, type WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import type { LightweightChatTranscript } from '@sourcegraph/cody-shared/src/chat/transcript'
import clsx from 'clsx'
import {
    CheckIcon,
    DownloadIcon,
    HistoryIcon,
    MessageSquarePlusIcon,
    PencilIcon,
    Trash2Icon,
    TrashIcon,
} from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WebviewType } from '../../src/chat/protocol'
import {
    INTENT_MAPPING,
    IntentEnum,
} from '../chat/cells/messageCell/human/editor/toolbar/ModeSelectorButton'
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

interface UIState {
    searchText: string
    visibleItems: number
    isLoading: boolean
    isDeleteAllActive: boolean
    deletingChatIds: Set<string>
    renameInProgress: string | null
    renameInputValue: string
}

const initialUIState: UIState = {
    searchText: '',
    visibleItems: HISTORY_ITEMS_PER_PAGE,
    isLoading: false,
    isDeleteAllActive: false,
    deletingChatIds: new Set(),
    renameInProgress: null,
    renameInputValue: '',
}

export const HistoryTab: React.FC<HistoryTabProps> = props => {
    const userHistory = useUserHistory()
    const chats = useMemo(
        () => (userHistory ? Object.values(userHistory).reverse() : null),
        [userHistory]
    )

    return (
        <div
            className={clsx(
                'tw-flex tw-flex-col tw-justify-center tw-overflow-hidden tw-h-full tw-w-full tw-m-4',
                {
                    'tw-items-center': !chats,
                }
            )}
        >
            {!chats ? <LoadingDots /> : <HistoryTabWithData {...props} chats={chats} />}
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
    const [uiState, setUIState] = useState<UIState>(initialUIState)
    const observerRef = useRef<IntersectionObserver | null>(null)
    const loadingRef = useRef<HTMLDivElement>(null)
    const renameInputRef = useRef<HTMLInputElement>(null)

    const nonEmptyChats = useMemo(() => chats.filter(c => c?.firstHumanMessageText?.length), [chats])

    const filteredChats = useMemo(() => {
        if (!uiState.searchText.trim()) return nonEmptyChats

        const searchTerm = uiState.searchText.toLowerCase()
        return nonEmptyChats.filter(
            chat =>
                chat.chatTitle?.toLowerCase().includes(searchTerm) ||
                chat.firstHumanMessageText?.toLowerCase().includes(searchTerm)
        )
    }, [nonEmptyChats, uiState.searchText])

    const displayedChats = useMemo(
        () => filteredChats.slice(0, uiState.visibleItems),
        [filteredChats, uiState.visibleItems]
    )

    const hasMoreItems = uiState.visibleItems < filteredChats.length

    const updateUIState = useCallback((updates: Partial<UIState>) => {
        setUIState(prev => ({ ...prev, ...updates }))
    }, [])

    const handleDeleteChat = useCallback(
        (e: React.MouseEvent | React.KeyboardEvent, id: string) => {
            e.preventDefault()
            e.stopPropagation()

            updateUIState({
                deletingChatIds: new Set([...uiState.deletingChatIds, id]),
                ...(id === 'clear-all-no-confirm' && {
                    visibleItems: Math.min(
                        uiState.visibleItems,
                        filteredChats.length - uiState.deletingChatIds.size
                    ),
                }),
            })

            vscodeAPI.postMessage({
                command: 'command',
                id: 'cody.chat.history.clear',
                arg: id,
            })
        },
        [vscodeAPI, uiState.deletingChatIds, uiState.visibleItems, filteredChats.length, updateUIState]
    )

    const handleRenameSubmit = useCallback(
        (e: React.MouseEvent | React.KeyboardEvent, id: string, newName?: string) => {
            e.preventDefault()
            e.stopPropagation()

            const nameToUse = newName || uiState.renameInputValue
            if (!nameToUse.trim()) {
                updateUIState({ renameInProgress: null, renameInputValue: '' })
                return
            }

            vscodeAPI.postMessage({
                command: 'command',
                id: 'cody.chat.history.rename',
                args: { chatID: id, newName: nameToUse },
            })
            updateUIState({ renameInProgress: null, renameInputValue: '' })
        },
        [vscodeAPI, uiState.renameInputValue, updateUIState]
    )

    const handleStartNewChat = useCallback(() => {
        vscodeAPI.postMessage({
            command: 'command',
            id: getCreateNewChatCommand({ IDE, webviewType, multipleWebviewsEnabled }),
        })
        setView(View.Chat)
    }, [vscodeAPI, IDE, webviewType, multipleWebviewsEnabled, setView])

    const handleExport = useCallback(() => downloadChatHistory(extensionAPI), [extensionAPI])

    const startRename = useCallback(
        (id: string, currentTitle: string) => {
            updateUIState({ renameInProgress: id, renameInputValue: currentTitle })
        },
        [updateUIState]
    )

    const cancelRename = useCallback(() => {
        updateUIState({ renameInProgress: null, renameInputValue: '' })
    }, [updateUIState])

    // Handle rename input focus
    useEffect(() => {
        if (uiState.renameInProgress && renameInputRef.current) {
            renameInputRef.current.focus()
            renameInputRef.current.select()
        }
    }, [uiState.renameInProgress])

    // Handle messages and intersection observer
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data
            if (message.type === 'deletionComplete' && message.chatID) {
                const newDeletingIds = new Set(uiState.deletingChatIds)
                newDeletingIds.delete(message.chatID)
                updateUIState({ deletingChatIds: newDeletingIds })
            }
        }

        const loadMoreItems = () => {
            if (hasMoreItems && !uiState.isLoading) {
                updateUIState({ isLoading: true })
                setTimeout(() => {
                    updateUIState({
                        visibleItems: Math.min(
                            uiState.visibleItems + HISTORY_ITEMS_PER_PAGE,
                            filteredChats.length
                        ),
                        isLoading: false,
                    })
                }, 300)
            }
        }

        observerRef.current = new IntersectionObserver(
            entries => entries[0].isIntersecting && loadMoreItems(),
            { threshold: 0.1 }
        )

        window.addEventListener('message', handleMessage)

        if (loadingRef.current && hasMoreItems) {
            observerRef.current.observe(loadingRef.current)
        }

        return () => {
            window.removeEventListener('message', handleMessage)
            observerRef.current?.disconnect()
        }
    }, [
        hasMoreItems,
        uiState.isLoading,
        uiState.visibleItems,
        uiState.deletingChatIds,
        filteredChats.length,
        updateUIState,
    ])

    // Adjust visible items when chats are deleted
    useEffect(() => {
        if (uiState.deletingChatIds.size > 0) {
            const newVisibleItems = Math.max(
                HISTORY_ITEMS_PER_PAGE,
                Math.min(
                    uiState.visibleItems,
                    filteredChats.length + Math.min(HISTORY_ITEMS_PER_PAGE, uiState.deletingChatIds.size)
                )
            )
            updateUIState({ visibleItems: newVisibleItems })
        }
    }, [uiState.deletingChatIds.size, filteredChats.length, uiState.visibleItems, updateUIState])

    if (!nonEmptyChats.length) {
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
                        className="tw-bg-popover tw-border tw-border-border !tw-justify-between tw-text-sidebar-foreground"
                        onClick={handleExport}
                    >
                        <div className="tw-flex tw-items-center">
                            <DownloadIcon size={16} className="tw-mr-3" /> Export
                        </div>
                    </Button>
                    <Button
                        className="tw-bg-popover tw-border tw-border-border !tw-justify-between tw-text-sidebar-foreground"
                        onClick={() => updateUIState({ isDeleteAllActive: true })}
                    >
                        <div className="tw-flex tw-items-center">
                            <Trash2Icon size={16} className="tw-mr-3" /> Delete all
                        </div>
                    </Button>
                </header>
            )}

            {uiState.isDeleteAllActive && (
                <div
                    className="tw-my-4 tw-p-4 tw-mx-[0.5rem] tw-border tw-bg-muted-transparent tw-border-red-800 tw-rounded-lg"
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
                    <div className="tw-flex tw-gap-2">
                        <Button
                            size="sm"
                            aria-label="Delete all chats"
                            className="tw-bg-popover tw-border tw-border-border tw-text-white tw-bg-red-800 hover:tw-bg-red-900 focus:tw-ring-4"
                            onClick={e => {
                                handleDeleteChat(e, 'clear-all-no-confirm')
                                updateUIState({ isDeleteAllActive: false })
                            }}
                        >
                            Delete all chats
                        </Button>
                        <Button
                            size="sm"
                            className="tw-bg-popover tw-border tw-border-border tw-text-sidebar-foreground"
                            onClick={() => updateUIState({ isDeleteAllActive: false })}
                            aria-label="Cancel"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            <CommandList>
                <CommandInput
                    value={uiState.searchText}
                    onValueChange={value => updateUIState({ searchText: value })}
                    placeholder="Search..."
                    className="tw-m-[0.5rem] !tw-p-[0.5rem] tw-rounded tw-bg-input-background tw-text-input-foreground focus:tw-shadow-[0_0_0_0.125rem_var(--vscode-focusBorder)]"
                    disabled={chats.length === 0 && !uiState.renameInProgress}
                    autoFocus={false}
                />
            </CommandList>

            <CommandList className="tw-flex-1 tw-overflow-y-auto tw-m-2">
                {displayedChats.map((chat: LightweightChatTranscript) => {
                    const id = chat.lastInteractionTimestamp
                    const lastMessage = chat.firstHumanMessageText
                    const chatTitle = chat.chatTitle || lastMessage
                    const timestamp = new Date(chat.lastInteractionTimestamp)
                        .toLocaleString()
                        .replace('T', ', ')
                        .replace('Z', '')
                    const mode = INTENT_MAPPING[chat.mode || 'chat']
                    const isRenaming = uiState.renameInProgress === id

                    return (
                        <CommandItem
                            key={id}
                            className={`tw-text-left tw-truncate tw-w-full tw-rounded-md tw-text-sm ${styles.historyItem} tw-overflow-hidden tw-text-sidebar-foreground tw-align-baseline`}
                            onSelect={() =>
                                vscodeAPI.postMessage({ command: 'restoreHistory', chatID: id })
                            }
                            title={chat.model}
                        >
                            <div className="tw-truncate tw-w-full tw-flex tw-flex-col tw-gap-2">
                                <div>
                                    {isRenaming ? (
                                        <input
                                            ref={renameInputRef}
                                            type="text"
                                            value={uiState.renameInputValue}
                                            onChange={e =>
                                                updateUIState({ renameInputValue: e.target.value })
                                            }
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleRenameSubmit(e, id)
                                                else if (e.key === 'Escape') cancelRename()
                                            }}
                                            className="tw-w-full tw-bg-input-background tw-text-input-foreground tw-border tw-border-border tw-rounded tw-px-2 tw-py-1 tw-text-sm"
                                            onClick={e => e.stopPropagation()}
                                        />
                                    ) : mode !== IntentEnum.Chat ? (
                                        `[${mode}] ${chatTitle}`
                                    ) : (
                                        chatTitle
                                    )}
                                </div>
                                <div className="tw-text-left tw-text-muted-foreground">{timestamp}</div>
                            </div>

                            {isRenaming ? (
                                <Button
                                    variant="outline"
                                    title="Enter to confirm or Escape to cancel"
                                    aria-label="rename-history-submit-button"
                                    className={styles.deleteButton}
                                    onClick={e => handleRenameSubmit(e, id)}
                                    onKeyDown={e => handleRenameSubmit(e, id)}
                                >
                                    <CheckIcon className="tw-w-8 tw-h-8" size={16} strokeWidth="1.25" />
                                </Button>
                            ) : (
                                <div className="tw-flex tw-gap-2">
                                    <Button
                                        variant="outline"
                                        title="Rename chat"
                                        aria-label="rename-history-button"
                                        className={styles.deleteButton}
                                        onClick={e => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            startRename(id, chatTitle || lastMessage || 'Untitled')
                                        }}
                                    >
                                        <PencilIcon
                                            className="tw-w-8 tw-h-8"
                                            size={16}
                                            strokeWidth="1.25"
                                        />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        title="Delete chat history"
                                        aria-label="delete-history-button"
                                        className={styles.deleteButton}
                                        onClick={e => handleDeleteChat(e, id)}
                                        onKeyDown={e => handleDeleteChat(e, id)}
                                    >
                                        <TrashIcon
                                            className="tw-w-8 tw-h-8"
                                            size={16}
                                            strokeWidth="1.25"
                                        />
                                    </Button>
                                </div>
                            )}
                        </CommandItem>
                    )
                })}

                {hasMoreItems && (
                    <div ref={loadingRef} className="tw-flex tw-justify-center tw-items-center tw-py-4">
                        {uiState.isLoading ? (
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
