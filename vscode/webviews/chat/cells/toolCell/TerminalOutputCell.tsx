import type { UITerminalToolOutput } from '@sourcegraph/cody-shared'
import { Terminal } from 'lucide-react'
import type { FC } from 'react'
import { Skeleton } from '../../../components/shadcn/ui/skeleton'
import { cn } from '../../../components/shadcn/utils'
import { BaseCell } from './BaseCell'

interface TerminalOutputCellProps {
    result: UITerminalToolOutput
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

    const renderHeaderContent = () => {
        if (isLoading) {
            return (
                <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-flex-1">
                    <Skeleton className="tw-h-4 tw-w-40 tw-bg-zinc-800 tw-animate-pulse" />
                </div>
            )
        }

        return (
            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                <code className="tw-font-mono tw-bg-zinc-800 tw-px-2 tw-py-0.5 tw-rounded tw-text-zinc-200">
                    $ {result?.output.find(l => l.type === 'input')?.content}
                </code>
            </div>
        )
    }

    const renderBodyContent = () => {
        if (isLoading) {
            return (
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
            )
        }

        return (
            <pre className="tw-font-mono tw-text-xs tw-p-4 tw-bg-black tw-rounded-b-md tw-overflow-x-auto">
                {result.output.map((line, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                    <div key={index} className={cn(getLineClass(line.type))}>
                        {line.type === 'input' ? `$ ${line.content}` : line.content}
                    </div>
                ))}
            </pre>
        )
    }

    return (
        <BaseCell
            icon={Terminal}
            headerContent={renderHeaderContent()}
            bodyContent={renderBodyContent()}
            className={className}
            isLoading={isLoading}
            defaultOpen={defaultOpen}
        />
    )
}
