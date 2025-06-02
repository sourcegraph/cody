import type { WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import { AlertTriangle, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '../components/shadcn/ui/button'
import styles from './ErrorItem.module.css'
import { downloadChatHistory } from './downloadChatHistory'

interface StorageWarningBannerProps {
    extensionAPI: WebviewToExtensionAPI
    onTrim: () => void
    onClearAll: () => void
}

export const StorageWarningBanner = ({
    extensionAPI,
    onTrim,
    onClearAll,
}: StorageWarningBannerProps) => {
    const onExport = useCallback(() => downloadChatHistory(extensionAPI), [extensionAPI])
    const [isVisible, setIsVisible] = useState(true)

    const handleClose = () => {
        setIsVisible(false)
    }

    if (!isVisible) {
        return null
    }

    return (
        <div
            className={styles.errorItem}
            style={{
                background: 'rgba(107, 114, 128, 0.1)',
                borderLeft: '4px solid #3b82f6',
                position: 'relative',
            }}
        >
            <div className={styles.icon}>
                <AlertTriangle className="h-6 w-6 text-blue-600" />
            </div>
            <div className={styles.body}>
                <header>
                    <h1 style={{ color: '#3b82f6' }}>Storage is Full</h1>
                    <p style={{ color: '#6b7280' }}>
                        Please remove some chat history to avoid performance issues and continue using
                        Cody smoothly.
                    </p>
                </header>
                <div
                    className={styles.actions}
                    style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}
                >
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                        onClick={onTrim}
                    >
                        Remove 5 Old Chats
                    </Button>
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
                className="absolute top-1 right-2 h-4 w-4 flex items-center justify-center hover:bg-gray-100 rounded cursor-pointer"
                style={{
                    zIndex: 10,
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--vscode-foreground)',
                }}
                onClick={handleClose}
            >
                <X className="h-2 w-2" />
            </button>
        </div>
    )
}

export default StorageWarningBanner
