import type { WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import { AlertTriangle, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '../components/shadcn/ui/button'
import styles from './ErrorItem.module.css'
import { downloadChatHistory } from './downloadChatHistory'

interface StorageWarningBannerProps {
    extensionAPI: WebviewToExtensionAPI
    onClearAll: () => void
}

export const StorageWarningBanner = ({ extensionAPI, onClearAll }: StorageWarningBannerProps) => {
    const onExport = useCallback(() => downloadChatHistory(extensionAPI), [extensionAPI])
    const [isVisible, setIsVisible] = useState(true)

    const handleClose = () => {
        setIsVisible(false)
    }

    if (!isVisible) {
        return null
    }

    return (
        <div className={`${styles.errorItem} bg-gray-500/10 border-l-4 border-blue-500 relative`}>
            <div className={styles.icon}>
                <AlertTriangle className="h-6 w-6 text-blue-600" />
            </div>
            <div className={styles.body}>
                <header>
                    <h1 className="text-blue-500">Storage is Full</h1>
                    <p className="text-gray-500">
                        Low local storage space detected. Chat performance may be slow. To fix this,
                        export your chat history to save a copy, then clear your chat history to free up
                        space.
                    </p>
                </header>
                <div className={`${styles.actions} flex gap-3 flex-wrap`}>
                    <Button
                        variant="outline"
                        size="sm"
                        className="bg-white text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 text-xs"
                        onClick={onExport}
                    >
                        Export Old Chats
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="bg-white text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300 text-xs"
                        onClick={onClearAll}
                    >
                        Clear All
                    </Button>
                </div>
            </div>
            <button
                type="button"
                className="absolute top-1 right-2 h-4 w-4 flex items-center justify-center hover:bg-gray-100 rounded cursor-pointer z-10 p-0 border-none bg-transparent text-[var(--vscode-foreground)]"
                onClick={handleClose}
            >
                <X className="h-2 w-2" />
            </button>
        </div>
    )
}

export default StorageWarningBanner
