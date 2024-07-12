import type { AuthStatus } from '@sourcegraph/cody-shared'
import type { QuickPickItem } from 'vscode'

export interface StatusBarError {
    title: string
    description: string
    errorType: StatusBarErrorName
    removeAfterSelected: boolean
    removeAfterEpoch?: number
    onShow?: () => void
    onSelect?: () => void
}

export interface CodyStatusBar {
    dispose(): void
    startLoading(
        label: string,
        params?: {
            // When set, the loading lease will expire after the timeout to avoid getting stuck
            timeoutMs: number
        }
    ): () => void
    addError(error: StatusBarError): () => void
    hasError(error: StatusBarErrorName): boolean
    syncAuthStatus(newStatus: AuthStatus): void
}

export interface StatusBarItem extends QuickPickItem {
    onSelect: () => Promise<void>
}

export type StatusBarErrorName = 'auth' | 'RateLimitError' | 'AutoCompleteDisabledByAdmin'
