import type { UIToolOutput } from '@sourcegraph/cody-shared'
import { AlertCircle, CheckCircle, Info } from 'lucide-react'
import type { FC } from 'react'
import { Badge } from '../../../components/shadcn/ui/badge'
import { cn } from '../../../components/shadcn/utils'
import { BaseCell } from './BaseCell'

interface OutputStatusProps {
    output: UIToolOutput
    className?: string
    defaultOpen?: boolean
}

// Extract mapping functions outside the component
const getStatusIcon = (status: string) => {
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

const getStatusClass = (status: string) => {
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

const getStatusLabel = (status: string) => {
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

const getBadgeClass = (status: string) => {
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

export const OutputStatusCell: FC<OutputStatusProps> = ({ output, className, defaultOpen = false }) => {
    if (!output.title) {
        return null
    }

    const status = output.status || 'info'
    const StatusIcon = getStatusIcon(status)

    // Define headerContent directly as JSX
    const headerContent = (
        <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
            <div className="tw-flex tw-items-center tw-gap-2">
                <span className="tw-font-medium">{output.title}</span>
                <Badge variant="outline" className={cn(getBadgeClass(status))}>
                    {getStatusLabel(status)}
                </Badge>
            </div>
        </div>
    )

    // Define bodyContent directly as JSX
    const bodyContent = (
        <div className={cn('tw-p-4', getStatusClass(status))}>
            {output.content && (
                <div className="tw-rounded-md tw-p-3 tw-font-mono tw-text-xs tw-mb-4 tw-overflow-x-auto">
                    <pre className="tw-whitespace-pre-wrap tw-break-words tw-text-zinc-300">
                        {output.content}
                    </pre>
                </div>
            )}
        </div>
    )

    return (
        <BaseCell
            icon={StatusIcon}
            headerContent={headerContent}
            bodyContent={bodyContent}
            className={className}
            defaultOpen={defaultOpen}
        />
    )
}
