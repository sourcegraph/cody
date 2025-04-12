import { UIToolStatus } from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { AlertCircle, CheckCircle, Info, ServerIcon } from 'lucide-react'
import type { FC } from 'react'
import { cn } from '../../../components/shadcn/utils'
import { BaseCell } from './BaseCell'

interface OutputStatusProps {
    item: ContextItemToolState
    className?: string
    defaultOpen?: boolean
}

// Extract mapping functions outside the component
const getStatusIcon = (status: UIToolStatus) => {
    switch (status) {
        case UIToolStatus.Done:
            return CheckCircle
        case UIToolStatus.Error:
            return AlertCircle
        default:
            return Info
    }
}

const getStatusClass = (status: UIToolStatus) => {
    switch (status) {
        case UIToolStatus.Done:
            return 'tw-bg-emerald-950/30 tw-border-emerald-800/50'
        case UIToolStatus.Error:
            return 'tw-bg-red-950/30 tw-border-red-800/50'
        case UIToolStatus.Pending:
            return 'tw-bg-yellow-950/30 tw-border-yellow-800/50'
        default:
            return ''
    }
}

export const OutputStatusCell: FC<OutputStatusProps> = ({ item, className, defaultOpen = false }) => {
    if (!item.title) {
        item.title = item.toolName
    }

    const status = item.status || 'success'
    const StatusIcon = getStatusIcon(status)

    const outputTypeIcon = item.outputType === 'mcp' ? ServerIcon : StatusIcon

    const headerContent = (
        <div className="tw-flex tw-flex-row tw-items-center tw-gap-2 tw-overflow-hidden">
            <div className="tw-flex tw-items-center tw-gap-2 tw-text-left tw-truncate tw-w-full">
                <span className="tw-font-sm">{item.title ?? item.toolName}</span>
            </div>
        </div>
    )

    const bodyContent = (
        <div className={cn('tw-p-4', getStatusClass(status))}>
            {item.content && (
                <div className="tw-rounded-md tw-p-3 tw-font-mono tw-text-xs tw-mb-4 tw-overflow-x-auto">
                    <pre className="tw-whitespace-pre-wrap tw-break-words tw-text-zinc-300">
                        {item.content}
                    </pre>
                </div>
            )}
        </div>
    )

    return (
        <BaseCell
            icon={outputTypeIcon}
            headerContent={headerContent}
            bodyContent={bodyContent}
            className={className}
            defaultOpen={defaultOpen}
            status={item?.status}
        />
    )
}
