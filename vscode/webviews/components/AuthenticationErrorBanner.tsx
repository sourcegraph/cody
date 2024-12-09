import type { AuthenticationErrorMessage } from '@sourcegraph/cody-shared'
import { TriangleAlertIcon } from 'lucide-react'
import type React from 'react'
import { useCallback } from 'react'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { Button } from './shadcn/ui/button'
interface AuthenticationErrorBannerProps {
    errorMessage: AuthenticationErrorMessage
}

export const AuthenticationErrorBanner: React.FC<AuthenticationErrorBannerProps> = ({
    errorMessage,
}) => {
    const signOut = useCallback(() => {
        getVSCodeAPI().postMessage({ command: 'auth', authKind: 'signout' })
    }, [])

    return (
        <div className="tw-w-full tw-px-2 tw-py-3 tw-text-center tw-border-b tw-border-b-border tw-text-sm tw-text-status-offline-foreground tw-bg-status-offline-background tw-flex tw-justify-center tw-items-center tw-gap-3">
            <TriangleAlertIcon size={14} strokeWidth={2} />
            <span className="tw-flex-1 tw-text-xs">
                <span className="tw-font-bold">{errorMessage.title}</span> &mdash;
                {errorMessage.message}
            </span>
            <Button variant="secondary" size="sm" onClick={signOut} className="tw-flex-shrink-0">
                Sign Out
            </Button>
        </div>
    )
}
