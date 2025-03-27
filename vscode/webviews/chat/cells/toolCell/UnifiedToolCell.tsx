import {
    type UITerminalLine,
    UITerminalOutputType,
    UIToolStatus,
    displayPath,
} from '@sourcegraph/cody-shared'
import type {
    ContextItem,
    ContextItemToolState,
} from '@sourcegraph/cody-shared/src/codebase-context/messages'
import {
    AlertCircle,
    Bug,
    BugOff,
    CheckCircle,
    FileCode,
    FileX,
    Info,
    type LucideIcon,
    Search,
    Terminal,
} from 'lucide-react'
import { type FC, useCallback, useMemo } from 'react'
import type { URI } from 'vscode-uri'
import { Button } from '../../../components/shadcn/ui/button'
import { Skeleton } from '../../../components/shadcn/ui/skeleton'
import { cn } from '../../../components/shadcn/utils'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'
import { BaseCell } from './BaseCell'

/**
 * Props for the UnifiedToolCell component
 */
export interface UnifiedToolCellProps {
    /** The tool state to render */
    item: ContextItemToolState
    /** Optional title override */
    title?: string
    /** Additional class names */
    className?: string
    /** Whether the cell is in a loading state */
    isLoading?: boolean
    /** Whether the cell should be open by default */
    defaultOpen?: boolean
    /** Optional callback for file link clicks */
    onFileLinkClicked?: (uri: URI) => void
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

/**
 * Get CSS class for terminal line based on its type
 */
const getLineClass = (type?: string) => {
    if (type === 'input') return 'tw-text-cyan-400 tw-font-bold'
    if (type === 'error') return 'tw-text-red-400'
    if (type === 'warning') return 'tw-text-yellow-400'
    if (type === 'success') return 'tw-text-green-400'
    return 'tw-text-zinc-300'
}

/**
 * Format terminal output as an array of TerminalLine objects
 */
function convertToTerminalLines(command: string, content?: string): UITerminalLine[] {
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

/**
 * Get appropriate icon based on tool type and status
 */
function getToolIcon(item: ContextItemToolState): LucideIcon {
    const { outputType, status, toolName } = item

    // Special case for diagnostic tool
    if (toolName === 'get_diagnostic') {
        return status === UIToolStatus.Info ? Bug : BugOff
    }

    // Based on output type
    if (outputType === 'file-view') {
        return status === UIToolStatus.Error ? FileX : FileCode
    }

    if (outputType === 'search-result') {
        return Search
    }

    if (outputType === 'terminal-output') {
        return Terminal
    }

    // Default status icons
    if (status === UIToolStatus.Done) {
        return CheckCircle
    }

    if (status === UIToolStatus.Error) {
        return AlertCircle
    }

    return Info
}

/**
 * A unified component for rendering all types of tool cells
 */
export const UnifiedToolCell: FC<UnifiedToolCellProps> = ({
    item,
    title,
    className,
    isLoading = false,
    defaultOpen = false,
    onFileLinkClicked,
}) => {
    // Use the provided callback or default to VSCode API
    const handleFileLinkClick = useCallback(
        (uri: URI) => {
            if (onFileLinkClicked) {
                onFileLinkClicked(uri)
            } else {
                getVSCodeAPI()?.postMessage({ command: 'openFileLink', uri })
            }
        },
        [onFileLinkClicked]
    )

    // If no item is provided, show a skeleton loader
    if (!item) {
        return (
            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-h-7">
                <Skeleton className="tw-h-4 tw-w-40 tw-bg-zinc-800 tw-animate-pulse" />
            </div>
        )
    }

    const displayTitle = title || item.title || ''
    const icon = getToolIcon(item)

    // Render header content based on output type
    const renderHeaderContent = () => {
        if (isLoading) {
            return (
                <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-flex-1">
                    <Skeleton className="tw-h-4 tw-w-40 tw-bg-zinc-800 tw-animate-pulse" />
                </div>
            )
        }

        // For file view, show file path with click handler
        if (item.outputType === 'file-view') {
            const fileTitle = item.uri ? displayPath(item.uri) : displayTitle
            return (
                <Button
                    variant="ghost"
                    className={cn(
                        'tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-p-0 tw-w-full tw-text-left tw-truncate tw-z-10 hover:tw-bg-transparent tw-font-mono',
                        item.status === UIToolStatus.Error ? 'tw-border-red-700' : ''
                    )}
                    title={fileTitle}
                    onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (item.uri) handleFileLinkClick(item.uri)
                    }}
                >
                    {fileTitle}
                </Button>
            )
        }

        // For terminal output, show command
        if (item.outputType === 'terminal-output') {
            if (!item.content) {
                return (
                    <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                        <Button
                            variant="ghost"
                            className="tw-text-left tw-truncate tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-p-0 hover:tw-bg-transparent"
                        >
                            <span className="tw-font-mono">$ {displayTitle}</span>
                        </Button>
                    </div>
                )
            }
            const lines = convertToTerminalLines(displayTitle, item.content)
            return (
                <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                    <Button
                        variant="ghost"
                        className="tw-text-left tw-truncate tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-p-0 hover:tw-bg-transparent"
                    >
                        <span className="tw-font-mono">$ {lines[0]?.content || displayTitle}</span>
                    </Button>
                </div>
            )
        }

        // For search results, show query
        if (item.outputType === 'search-result') {
            return (
                <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                    <span className="tw-font-mono tw-truncate">{displayTitle}</span>
                </div>
            )
        }

        // Default header content
        return (
            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                <span className="tw-truncate">{displayTitle}</span>
            </div>
        )
    }

    // Render body content based on output type
    const renderBodyContent = () => {
        if (isLoading) {
            return (
                <div className="tw-font-mono tw-text-xs tw-p-4 tw-bg-black tw-rounded-b-md tw-space-y-1">
                    {Array.from({ length: 6 }).map((_, i) => {
                        const uniqueKey = `skeleton-line-${i}-${Date.now()}-${Math.random()
                            .toString(36)
                            .substring(2, 9)}`
                        return (
                            <Skeleton
                                key={uniqueKey}
                                className={cn(
                                    'tw-h-4 tw-bg-zinc-800 tw-animate-pulse',
                                    i === 0 ? 'tw-w-3/4' : i === 5 ? 'tw-w-1/4' : 'tw-w-full'
                                )}
                            />
                        )
                    })}
                </div>
            )
        }

        // Terminal output
        if (item.outputType === 'terminal-output') {
            const isDiagnosticTool = item.toolName === 'get_diagnostic'
            const lines = useMemo(() => {
                if (item?.content && item.content.trim() !== '') {
                    return convertToTerminalLines(displayTitle, item.content)
                }
                return []
            }, [item?.content])

            if (lines?.length < 2) {
                // Since the first line is the name of the command, this means the result is empty.
                return null
            }

            return (
                <pre className="tw-font-mono tw-text-xs tw-p-4 tw-bg-black tw-rounded-b-md tw-overflow-x-auto">
                    {lines.map(line => {
                        if (!line.type) {
                            return null
                        }
                        const lineKey = `${line.type}-${line.content}-${Date.now()}-${Math.random()
                            .toString(36)
                            .substring(2, 9)}`
                        return (
                            <div key={lineKey} className={cn(getLineClass(line.type))}>
                                {line.type === 'input' && !isDiagnosticTool
                                    ? `$ ${line.content}`
                                    : line.content}
                            </div>
                        )
                    })}
                </pre>
            )
        }

        // Search results
        if (item.outputType === 'search-result' && item.searchResultItems?.length) {
            return (
                <div className="tw-p-2 tw-space-y-2">
                    {item.searchResultItems.map((result: ContextItem) => {
                        const resultKey = `search-result-${result.uri}-${
                            result.range?.start?.line || 0
                        }-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
                        return (
                            <div
                                key={resultKey}
                                className="tw-border tw-border-zinc-700 tw-rounded-md tw-p-2"
                            >
                                <div className="tw-flex tw-items-center tw-gap-2 tw-mb-1">
                                    <Button
                                        variant="ghost"
                                        className="tw-p-0 tw-h-auto tw-text-blue-400 hover:tw-text-blue-300 tw-font-mono tw-text-xs"
                                        onClick={() => {
                                            if (result.uri) handleFileLinkClick(result.uri)
                                        }}
                                    >
                                        {result.uri ? displayPath(result.uri) : 'Unknown file'}
                                    </Button>
                                    {result.range?.start?.line !== undefined && (
                                        <span className="tw-text-xs tw-text-zinc-400">
                                            Line {result.range?.start?.line + 1}
                                        </span>
                                    )}
                                </div>
                                {result.content && (
                                    <pre className="tw-bg-zinc-900 tw-p-2 tw-rounded tw-text-xs tw-overflow-x-auto tw-font-mono">
                                        {result.content}
                                    </pre>
                                )}
                            </div>
                        )
                    })}
                </div>
            )
        }

        // File content
        if (item.outputType === 'file-view' && item.content) {
            return (
                <pre className="tw-font-mono tw-text-xs tw-p-4 tw-bg-black tw-rounded-b-md tw-overflow-x-auto">
                    {item.content}
                </pre>
            )
        }

        // Generic status output
        if (item.content) {
            return (
                <div className="tw-p-4 tw-text-sm">
                    <p>{item.content}</p>
                </div>
            )
        }

        return null
    }

    return (
        <BaseCell
            icon={icon}
            headerContent={renderHeaderContent()}
            bodyContent={renderBodyContent()}
            className={className}
            isLoading={isLoading}
            defaultOpen={defaultOpen}
            status={item.status}
        />
    )
}
