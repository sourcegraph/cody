import { AlertCircle, CheckCircle, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { type FC, useState } from 'react'
import { Badge } from '../../../components/shadcn/ui/badge'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '../../../components/shadcn/ui/collapsible'
import { cn } from '../../../components/shadcn/utils'

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
    const [isOpen, setIsOpen] = useState(defaultOpen)

    const getStatusIcon = () => {
        switch (status) {
            case 'success':
                return <CheckCircle size={14} className="tw-flex-shrink-0 tw-text-emerald-400" />
            case 'error':
                return <AlertCircle size={14} className="tw-flex-shrink-0 tw-text-red-400" />
            case 'warning':
                return <AlertCircle size={14} className="tw-flex-shrink-0 tw-text-yellow-400" />
            default:
                return <Info size={14} className="tw-flex-shrink-0 tw-text-blue-400" />
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

    return (
        <div className={cn('tw-rounded-md tw-border tw-border-border', className)}>
            <Collapsible open={isOpen} onOpenChange={setIsOpen} className="tw-w-full tw-dark">
                <CollapsibleTrigger
                    className={cn(
                        'tw-flex tw-w-full tw-items-center tw-justify-between tw-px-4 tw-py-2 tw-text-sm tw-text-zinc-100 hover:tw-bg-zinc-800/50',
                        getHeaderClass()
                    )}
                >
                    <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                        {getStatusIcon()}
                        <div className="tw-flex tw-items-center tw-gap-2">
                            <span className="tw-font-medium">{title}</span>
                            <Badge variant="outline" className={cn(getBadgeClass())}>
                                {getStatusLabel()}
                            </Badge>
                        </div>
                    </div>
                    <div className="tw-flex tw-items-center tw-gap-2">
                        {isOpen ? (
                            <ChevronDown size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                        ) : (
                            <ChevronRight size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                        )}
                    </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className={cn('tw-p-4', getStatusClass())}>
                        {result && (
                            <div className="tw-bg-black tw-rounded-md tw-p-3 tw-font-mono tw-text-xs tw-mb-4 tw-overflow-x-auto">
                                <pre className="tw-whitespace-pre-wrap tw-break-words tw-text-zinc-300">
                                    {result}
                                </pre>
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    )
}
