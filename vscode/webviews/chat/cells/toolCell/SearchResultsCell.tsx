import { type ContextItem, displayPath } from '@sourcegraph/cody-shared'
import { FileCode, FileText, FolderOpen, Search } from 'lucide-react'
import type { FC } from 'react'
import type { URI } from 'vscode-uri'
import { Badge } from '../../../components/shadcn/ui/badge'
import { Button } from '../../../components/shadcn/ui/button'
import { Skeleton } from '../../../components/shadcn/ui/skeleton'
import { BaseCell } from './BaseCell'

interface SearchResultsProps {
    query: string
    results: ContextItem[]
    className?: string
    isLoading?: boolean
    defaultOpen?: boolean
    onFileLinkClicked: (uri: URI) => void
}

interface UISearchItem {
    fileName: string
    lineNumber?: string
    preview?: string
    type: 'file' | 'folder' | 'code'
    uri: URI
}

export function generateSearchToolResults(items: ContextItem[]): UISearchItem[] {
    return items.map(item => ({
        fileName: getFileName(item.uri),
        uri: item.uri,
        lineNumber: createRange(item.range?.start?.line, item.range?.end?.line),
        type: 'code',
    }))
}

// Helper function to create range string - moved outside for better readability
function createRange(startLine?: number, endLine?: number): string {
    if (startLine === undefined && endLine === undefined) {
        return ''
    }
    return `${startLine !== undefined ? startLine + 1 : '0'}-${endLine ?? 'EOF'}`
}

// Helper function to extract file name from URI - moved outside for better readability
function getFileName(uri: URI): string {
    const displayName = displayPath(uri)

    if (!displayName.includes('/-/blob/')) {
        return displayName
    }

    const parts = displayName.split('/-/blob/')
    const result = parts[1] || displayName

    // Remove query parameters if present
    const queryIndex = result.indexOf('?')
    return queryIndex !== -1 ? result.substring(0, queryIndex) : result
}

const getIcon = (type: string) => {
    switch (type) {
        case 'file':
            return <FileText size={16} className="tw-flex-shrink-0 tw-text-blue-400" />
        case 'folder':
            return <FolderOpen size={16} className="tw-flex-shrink-0 tw-text-yellow-400" />
        default:
            return <FileCode size={16} className="tw-flex-shrink-0 tw-text-emerald-400" />
    }
}

export const SearchResultsCell: FC<SearchResultsProps> = ({
    query,
    results,
    className,
    onFileLinkClicked,
    isLoading = false,
    defaultOpen = false,
}) => {
    if (!results) {
        return null
    }

    return (
        <BaseCell
            icon={Search}
            headerContent={
                isLoading ? (
                    <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-flex-1">
                        <Skeleton className="tw-h-4 tw-w-40 tw-bg-zinc-800 tw-animate-pulse" />
                        <Skeleton className="tw-h-5 tw-w-12 tw-ml-2 tw-bg-zinc-800 tw-animate-pulse tw-rounded-full" />
                    </div>
                ) : (
                    <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                        <code className="tw-px-1.5 tw-py-0.5 tw-bg-zinc-800 tw-rounded tw-text-zinc-200 tw-font-mono tw-text-xs">
                            {query}
                        </code>
                        <Badge variant="outline" className="tw-ml-2 tw-bg-zinc-800 tw-text-zinc-200">
                            {results.length} results
                        </Badge>
                    </div>
                )
            }
            bodyContent={
                isLoading ? (
                    <div className="tw-bg-zinc-950 tw-p-4 tw-space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                            <div key={i} className="tw-flex tw-items-center tw-gap-2 tw-py-1.5">
                                <Skeleton className="tw-h-4 tw-w-6 tw-bg-zinc-800 tw-animate-pulse" />
                                <Skeleton className="tw-h-4 tw-w-4 tw-bg-zinc-800 tw-animate-pulse tw-rounded-full" />
                                <Skeleton className="tw-h-4 tw-flex-1 tw-bg-zinc-800 tw-animate-pulse" />
                            </div>
                        ))}
                    </div>
                ) : results?.length === 0 ? null : (
                    <div className="tw-overflow-x-auto tw-bg-zinc-950 tw-p-0">
                        <div className="tw-font-mono tw-text-xs tw-flex tw-flex-col tw-gap-1">
                            {generateSearchToolResults(results).map((resultItem, index) => (
                                <Button
                                    onClick={e => {
                                        e.preventDefault()
                                        const _uri = resultItem.uri
                                        const _range = resultItem?.lineNumber
                                            ? `:${Number.parseInt(resultItem.lineNumber) + 1}`
                                            : ''
                                        const uri = _uri.with({ path: `${_uri.path}${_range}` })
                                        onFileLinkClicked(uri)
                                    }}
                                    variant="text"
                                    key={`${resultItem.fileName}-${index}`}
                                    className="tw-text-left tw-truncate tw-flex !tw-justify-start tw-py-1.5 tw-px-4 hover:tw-bg-zinc-900 tw-border-b tw-border-zinc-900 last:tw-border-b-0 tw-w-full !tw-items-center"
                                >
                                    <span className="tw-mr-2 tw-mt-0.5">{getIcon(resultItem.type)}</span>
                                    <div className="tw-flex tw-flex-col">
                                        <div className="tw-text-zinc-200">
                                            {resultItem.fileName}
                                            {resultItem?.lineNumber && (
                                                <span className="tw-text-zinc-500">
                                                    :{resultItem.lineNumber}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Button>
                            ))}
                        </div>
                    </div>
                )
            }
            className={className}
            isLoading={isLoading}
            defaultOpen={defaultOpen}
        />
    )
}
