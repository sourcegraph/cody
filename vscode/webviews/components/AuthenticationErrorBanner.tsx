import type { AuthenticationError } from '@sourcegraph/cody-shared'
import { TriangleAlertIcon } from 'lucide-react'
import type React from 'react'
import { useCallback } from 'react'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { Button } from './shadcn/ui/button'
interface AuthenticationErrorBannerProps {
    errorMessage: AuthenticationError
}

export const AuthenticationErrorBanner: React.FC<AuthenticationErrorBannerProps> = ({
    errorMessage,
}) => {
    const tryAgain = useCallback(() => {
        getVSCodeAPI().postMessage({ command: 'auth', authKind: 'refresh' })
    }, [])

    const signOut = useCallback(() => {
        getVSCodeAPI().postMessage({ command: 'auth', authKind: 'signout' })
    }, [])

    return (
        <div className="tw-w-full tw-px-3 tw-py-3 tw-border-b tw-border-b-border tw-text-status-offline-foreground tw-bg-status-offline-background">
            <h5 className="tw-font-bold tw-text-sm">
                <TriangleAlertIcon size={14} strokeWidth={2} className="tw-inline tw-mr-2" />
                {errorMessage.title}
            </h5>
            <p className="tw-text-sm">{errorMessage.message}</p>
            <div className="tw-flex tw-gap-3 tw-mt-3">
                {errorMessage.showTryAgain && (
                    <Button variant="secondary" size="sm" onClick={tryAgain}>
                        Try Again
                    </Button>
                )}
                <Button variant="secondary" size="sm" onClick={signOut}>
                    Sign Out
                </Button>
            </div>
        </div>
    )
}
