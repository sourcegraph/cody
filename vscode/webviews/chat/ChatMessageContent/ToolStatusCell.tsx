import { ChevronDown, ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/shadcn/ui/badge'
import { Button } from '../../components/shadcn/ui/button'
import { cn } from '../../components/shadcn/utils'

interface ToolStatusProps {
    status: string
    title: string
    output?: string
    className?: string
}

export function ToolStatusCell({ status, title, output, className }: ToolStatusProps) {
    const [isOpen, setIsOpen] = useState(false)

    const toggle = () => setIsOpen(prev => !prev)

    const statusLabels = {
        working: 'Working',
        success: 'Completed',
        error: 'Failed',
    }

    const statusStyles = {
        container: {
            working: 'tw-border-blue-200 tw-bg-blue-50 dark:tw-border-blue-900 dark:tw-bg-blue-950/30',
            success:
                'tw-border-green-200 tw-bg-green-50 dark:tw-border-green-900 dark:tw-bg-green-950/30',
            error: 'tw-border-red-200 tw-bg-red-50 dark:tw-border-red-900 dark:tw-bg-red-950/30',
        },
        badge: {
            working: 'tw-bg-blue-100 tw-text-blue-700 dark:tw-bg-blue-900/50 dark:tw-text-blue-300',
            success: 'tw-bg-green-100 tw-text-green-700 dark:tw-bg-green-900/50 dark:tw-text-green-300',
            error: 'tw-bg-red-100 tw-text-red-700 dark:tw-bg-red-900/50 dark:tw-text-red-300',
        },
    }

    const currentStatus = status === 'pending' ? 'working' : status === 'done' ? 'success' : 'error'

    return (
        <div className="tw-flex tw-flex-col tw-justify-center tw-w-full tw-gap-2 tw-my-2">
            <div
                className={cn(
                    'tw-rounded-lg tw-border tw-transition-all tw-duration-200 tw-overflow-hidden',
                    statusStyles.container[currentStatus],
                    className
                )}
            >
                <div className="tw-p-4">
                    <div className="tw-flex tw-items-start tw-gap-3">
                        <Badge
                            variant="outline"
                            className={cn(
                                'tw-text-xs tw-font-normal',
                                statusStyles.badge[currentStatus]
                            )}
                        >
                            {statusLabels[currentStatus]}
                        </Badge>
                        <div className="tw-flex-1 tw-min-w-0 tw-inline-flex tw-justify-between">
                            <div className="tw-font-medium tw-break-words">{title}</div>
                            <div className="tw-flex tw-items-center tw-mt-1.5 tw-gap-2">
                                {output && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={toggle}
                                        className="tw-h-6 tw-px-2 tw-text-xs tw-flex tw-items-center tw-gap-1 tw-opacity-80 hover:tw-opacity-100"
                                    >
                                        {isOpen ? 'Hide details' : 'Show details'}
                                        {isOpen ? (
                                            <ChevronLeft className="tw-h-3.5 tw-w-3.5" />
                                        ) : (
                                            <ChevronDown className="tw-h-3.5 tw-w-3.5" />
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                {output && (
                    <div
                        className={cn(
                            'tw-overflow-scroll tw-transition-all tw-ease-in-out',
                            isOpen ? 'tw-max-h-[100px] tw-opacity-100' : 'tw-max-h-0 tw-opacity-0'
                        )}
                    >
                        <div className="tw-px-4 tw-pb-4">
                            <div
                                className={cn(
                                    'tw-rounded-md tw-p-3 tw-font-mono tw-text-sm',
                                    'tw-bg-background tw-border-muted-foreground dark:tw-bg-background/5'
                                )}
                            >
                                <pre className="tw-whitespace-pre-wrap tw-break-words tw-text-sm">
                                    {output}
                                </pre>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
