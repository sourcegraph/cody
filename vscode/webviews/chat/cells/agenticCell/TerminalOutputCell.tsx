import type { TerminalLine } from '@sourcegraph/cody-shared'
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react'
import { type FC, useState } from 'react'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '../../../components/shadcn/ui/collapsible'
import { Skeleton } from '../../../components/shadcn/ui/skeleton'
import { cn } from '../../../components/shadcn/utils'

interface TerminalOutputCellProps {
    result: TerminalLine[]
    className?: string
    isLoading?: boolean
    defaultOpen?: boolean
}

export const TerminalOutputCell: FC<TerminalOutputCellProps> = ({
    result,
    className,
    isLoading = false,
    defaultOpen = false,
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen)

    const getLineClass = (type?: string) => {
        switch (type) {
            case 'input':
                return 'tw-text-cyan-400 tw-font-bold'
            case 'error':
                return 'tw-text-red-400'
            case 'warning':
                return 'tw-text-yellow-400'
            case 'success':
                return 'tw-text-green-400'
            default:
                return 'tw-text-zinc-300'
        }
    }

    return (
        <div className={cn('tw-rounded-md tw-border tw-border-border', className)}>
            <Collapsible open={isOpen} onOpenChange={setIsOpen} className="tw-w-full tw-dark">
                <CollapsibleTrigger
                    className={cn(
                        'tw-flex tw-w-full tw-items-center tw-justify-between tw-bg-zinc-900 tw-px-4 tw-py-2 tw-text-sm tw-text-zinc-100 hover:tw-bg-zinc-800',
                        isLoading && 'tw-cursor-wait'
                    )}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <div className="tw-flex tw-w-full tw-items-center tw-justify-between">
                            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-flex-1">
                                <Terminal
                                    size={16}
                                    className="tw-flex-shrink-0 tw-text-zinc-400 tw-animate-pulse"
                                />
                                <Skeleton className="tw-h-4 tw-w-40 tw-bg-zinc-800 tw-animate-pulse" />
                            </div>
                            <div className="tw-animate-pulse">
                                <ChevronDown size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                                <Terminal size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                                <code className="tw-font-mono tw-bg-zinc-800 tw-px-2 tw-py-0.5 tw-rounded tw-text-zinc-200">
                                    $ {result.find(l => l.type === 'input')?.content}
                                </code>
                            </div>
                            {isOpen ? (
                                <ChevronDown size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                            ) : (
                                <ChevronRight size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                            )}
                        </>
                    )}
                </CollapsibleTrigger>
                <CollapsibleContent>
                    {isLoading ? (
                        <div className="tw-bg-zinc-950 tw-p-0">
                            <div className="tw-font-mono tw-text-xs tw-p-4 tw-bg-black tw-rounded-b-md tw-space-y-1">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <Skeleton
                                        // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                                        key={i}
                                        className={cn(
                                            'tw-h-4 tw-bg-zinc-800 tw-animate-pulse',
                                            i === 0 ? 'tw-w-3/4' : i === 5 ? 'tw-w-1/4' : 'tw-w-full'
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="tw-bg-zinc-950 tw-p-0">
                            <pre className="tw-font-mono tw-text-xs tw-p-4 tw-bg-black tw-rounded-b-md tw-overflow-x-auto">
                                {result.map((line, index) => (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                                    <div key={index} className={cn(getLineClass(line.type))}>
                                        {line.type === 'input' ? `$ ${line.content}` : line.content}
                                    </div>
                                ))}
                            </pre>
                        </div>
                    )}
                </CollapsibleContent>
            </Collapsible>
        </div>
    )
}
