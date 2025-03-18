import { AlertCircle, CheckCircle, Info } from 'lucide-react'
import type { FC } from 'react'
import { Badge } from '../../../components/shadcn/ui/badge'
import { cn } from '../../../components/shadcn/utils'
import { BaseCell } from './BaseCell'

type StatusType = 'success' | 'error' | 'info' | 'warning'

interface OutputStatusProps {
    query?: string
    title: string
    result?: string
    status: StatusType
    className?: string
    defaultOpen?: boolean
}

export const OutputStatusCell: FC<OutputStatusProps> = ({
    title,
    result,
    status = 'info',
    className,
    defaultOpen = false,
}) => {
    const getStatusIcon = () => {
        switch (status) {
            case 'success':
                return CheckCircle
            case 'error':
            case 'warning':
                return AlertCircle
            default:
                return Info
        }
    }

    const getStatusClass = () => {
        switch (status) {
            case 'success':
                return 'tw-bg-emerald-950/30 tw-border-emerald-800/50'
            case 'error':
                return 'tw-bg-red-950/30 tw-border-red-800/50'
            case 'warning':
                return 'tw-bg-yellow-950/30 tw-border-yellow-800/50'
            default:
                return 'tw-bg-blue-950/30 tw-border-blue-800/50'
        }
    }

    const getHeaderClass = () => {
        switch (status) {
            case 'success':
                return 'tw-bg-emerald-900/30'
            case 'error':
                return 'tw-bg-red-900/30'
            case 'warning':
                return 'tw-bg-yellow-900/30'
            default:
                return 'tw-bg-blue-900/30'
        }
    }

    const getStatusLabel = () => {
        switch (status) {
            case 'success':
                return 'Success'
            case 'error':
                return 'Error'
            case 'warning':
                return 'Warning'
            default:
                return 'Info'
        }
    }

    const getBadgeClass = () => {
        switch (status) {
            case 'success':
                return 'tw-bg-emerald-900/50 tw-text-emerald-200 tw-border-emerald-700'
            case 'error':
                return 'tw-bg-red-900/50 tw-text-red-200 tw-border-red-700'
            case 'warning':
                return 'tw-bg-yellow-900/50 tw-text-yellow-200 tw-border-yellow-700'
            default:
                return 'tw-bg-blue-900/50 tw-text-blue-200 tw-border-blue-700'
        }
    }

    // Icon color is handled by the BaseCell component

    const renderHeaderContent = () => (
        <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
            <div className="tw-flex tw-items-center tw-gap-2">
                <span className="tw-font-medium">{title}</span>
                <Badge variant="outline" className={cn(getBadgeClass())}>
                    {getStatusLabel()}
                </Badge>
            </div>
        </div>
    )

    const renderBodyContent = () => (
        <div className={cn('tw-p-4', getStatusClass())}>
            {result && (
                <div className="tw-bg-black tw-rounded-md tw-p-3 tw-font-mono tw-text-xs tw-mb-4 tw-overflow-x-auto">
                    <pre className="tw-whitespace-pre-wrap tw-break-words tw-text-zinc-300">
                        {result}
                    </pre>
                </div>
            )}
        </div>
    )

    const StatusIcon = getStatusIcon()

    return (
        <BaseCell
            icon={StatusIcon}
            headerContent={renderHeaderContent()}
            bodyContent={renderBodyContent()}
            className={className}
            defaultOpen={defaultOpen}
            headerBgClass={getHeaderClass()}
        />
    )
}
