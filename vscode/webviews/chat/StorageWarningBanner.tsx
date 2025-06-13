import type { WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import { AlertTriangle, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '../components/shadcn/ui/button'
import type { VSCodeWrapper } from '../utils/VSCodeApi'
import styles from './ErrorItem.module.css'
import { downloadChatHistory } from './downloadChatHistory'

interface StorageWarningBannerProps {
    extensionAPI: WebviewToExtensionAPI
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage'>
}

export const StorageWarningBanner = ({ extensionAPI, vscodeAPI }: StorageWarningBannerProps) => {
    const onExport = useCallback(() => downloadChatHistory(extensionAPI), [extensionAPI])
    const onClearAll = useCallback(() => {
        vscodeAPI.postMessage({
            command: 'command',
            id: 'cody.chat.history.clear',
            arg: 'clear-all-no-confirm',
        })
    }, [vscodeAPI])
    const [isVisible, setIsVisible] = useState(true)

    const handleClose = () => {
        setIsVisible(false)
    }

    if (!isVisible) {
        return null
    }

    return (
        <div
            className={`${styles.errorItem} tw-bg-gray-500/10 tw-border-l-4 tw-border-blue-500 tw-relative`}
        >
            <div className={styles.icon}>
                <AlertTriangle className="tw-h-6 tw-w-6 tw-text-blue-600" />
            </div>
            <div className={styles.body}>
                <header>
                    <h1 className="tw-text-blue-500">Chat History Storage is Full</h1>
                    <p className="tw-text-gray-500">
                        VSCode's internal chat history storage is running low. Chat performance may be slow. To fix this,
                        export your chat history to save a copy, then clear your chat history to free up
                        space.
                    </p>
                </header>
                <div className={`${styles.actions} tw-flex tw-gap-3 tw-flex-wrap`}>
                    <Button
                        variant="outline"
                        size="sm"
                        className="tw-bg-white tw-text-blue-600 tw-border-blue-200 hover:tw-bg-blue-50 hover:tw-text-blue-700 hover:tw-border-blue-300 tw-text-xs"
                        onClick={onExport}
                    >
                        Export Old Chats
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="tw-bg-white tw-text-red-600 tw-border-red-200 hover:tw-bg-red-50 hover:tw-text-red-700 hover:tw-border-red-300 tw-text-xs"
                        onClick={onClearAll}
                    >
                        Clear All
                    </Button>
                </div>
            </div>
            <button
                type="button"
                className="tw-absolute tw-top-3 tw-right-2 tw-h-6 tw-w-6 tw-flex tw-items-center tw-justify-center hover:tw-bg-gray-100 tw-rounded tw-cursor-pointer tw-z-10 tw-p-0 tw-border-none tw-bg-transparent tw-text-[var(--vscode-foreground)]"
                onClick={handleClose}
            >
                <X className="tw-h-7 tw-w-7" />
            </button>
        </div>
    )
}

export default StorageWarningBanner
