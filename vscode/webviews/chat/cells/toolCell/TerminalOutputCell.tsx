import { type UITerminalLine, UITerminalOutputType, UIToolStatus } from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { Bug, BugOff, Terminal } from 'lucide-react'
import { type FC, useMemo } from 'react'
import { Skeleton } from '../../../components/shadcn/ui/skeleton'
import { cn } from '../../../components/shadcn/utils'
import { BaseCell } from './BaseCell'

interface TerminalOutputCellProps {
    command: string
    className?: string
    isLoading?: boolean
    defaultOpen?: boolean
    item: ContextItemToolState
}

/**
 * Formats a string output into an array of TerminalLine objects
 */
function formatOutputToTerminalLines(output: string, type: UITerminalOutputType): UITerminalLine[] {
    if (!output) {
        return []
    }

    return output.split('\n').map(line => ({
        content: line,
        type: type === 'error' ? UITerminalOutputType.Error : UITerminalOutputType.Output,
    }))
}

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

// Format the output as an array of TerminalLine objects
export function convertToTerminalLines(command: string, content?: string): UITerminalLine[] {
    if (!content) return []
    // Split content into strout and sterr parts
    // We will get the errors from between the <sterr> tags
    const sterrRegex = /<sterr>([\s\S]*)<\/sterr>/g
    const parts = content.split(sterrRegex)
    const stdout = parts[0] || ''
    const stderr = parts.length > 1 ? parts[1] : ''
    // If there's no output parts, return just the command
    if (parts.length < 2) {
        return [{ content: command, type: UITerminalOutputType.Input }].filter(
            line => line.content.trim() !== ''
        )
    }
    const lines: UITerminalLine[] = [
        { content: command, type: UITerminalOutputType.Input },
        ...formatOutputToTerminalLines(stdout, UITerminalOutputType.Output),
        ...formatOutputToTerminalLines(stderr, UITerminalOutputType.Error),
    ].filter(line => line.content.trim() !== '')

    return lines
}

export const TerminalOutputCell: FC<TerminalOutputCellProps> = ({
    item,
    className,
    isLoading = false,
    defaultOpen = false,
}) => {
    const icon =
        item.toolName === 'get_diagnostic'
            ? item.status === UIToolStatus.Info
                ? Bug
                : BugOff
            : Terminal
    // Process content into lines if provided, otherwise use lines prop
    const lines = useMemo(() => {
        if (item?.content && item.content.trim() !== '') {
            return convertToTerminalLines(item.title ?? 'Terminal', item.content)
        }
        return []
    }, [item.title, item?.content])

    const renderHeaderContent = () => {
        if (isLoading && item?.title) {
            return (
                <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-flex-1">
                    <Skeleton className="tw-h-4 tw-w-40 tw-bg-zinc-800 tw-animate-pulse" />
                </div>
            )
        }

        return (
            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                <code className="tw-text-left tw-truncate tw-font-mono tw-bg-zinc-800 tw-px-2 tw-py-0.5 tw-rounded tw-text-zinc-200">
                    $ {lines[0]?.content}
                </code>
            </div>
        )
    }

    const renderBodyContent = () => {
        if (isLoading || !lines?.length) {
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
                {lines.map((line, index) => {
                    if (!line.type) {
                        return null
                    }
                    return (
                        <div
                            key={`${line.type}-${line.content}-${index}`}
                            className={cn(getLineClass(line.type))}
                        >
                            {line.type === 'input' ? `$ ${line.content}` : line.content}
                        </div>
                    )
                })}
            </pre>
        )
    }

    return (
        <BaseCell
            icon={icon}
            headerContent={renderHeaderContent()}
            bodyContent={renderBodyContent()}
            className={className}
            isLoading={isLoading}
            defaultOpen={defaultOpen}
        />
    )
}
