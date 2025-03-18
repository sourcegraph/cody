import type { SearchResultView } from '@sourcegraph/cody-shared'
import { FileCode, FileText, FolderOpen, Search } from 'lucide-react'
import type { FC } from 'react'
import type { URI } from 'vscode-uri'
import { Badge } from '../../../components/shadcn/ui/badge'
import { Button } from '../../../components/shadcn/ui/button'
import { Skeleton } from '../../../components/shadcn/ui/skeleton'
// cn is used by BaseCell
import { BaseCell } from './BaseCell'

interface SearchResultsProps {
    result: SearchResultView
    className?: string
    isLoading?: boolean
    defaultOpen?: boolean
    onFileLinkClicked: (uri: URI) => void
}

export const SearchResultsCell: FC<SearchResultsProps> = ({
    result,
    className,
    onFileLinkClicked,
    isLoading = false,
    defaultOpen = false,
}) => {
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

    if (!result.results?.length) {
        return null
    }

    const renderHeaderContent = () => {
        if (isLoading) {
            return (
                <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-flex-1">
                    <Skeleton className="tw-h-4 tw-w-40 tw-bg-zinc-800 tw-animate-pulse" />
                    <Skeleton className="tw-h-5 tw-w-12 tw-ml-2 tw-bg-zinc-800 tw-animate-pulse tw-rounded-full" />
                </div>
            )
        }

        return (
            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                <code className="tw-px-1.5 tw-py-0.5 tw-bg-zinc-800 tw-rounded tw-text-zinc-200 tw-font-mono tw-text-xs">
                    {result.query}
                </code>
                <Badge variant="outline" className="tw-ml-2 tw-bg-zinc-800 tw-text-zinc-200">
                    {result.results.length} results
                </Badge>
            </div>
        )
    }

    const renderBodyContent = () => {
        if (isLoading) {
            return (
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
            )
        }

        return (
            <div className="tw-overflow-x-auto tw-bg-zinc-950 tw-p-0">
                <div className="tw-font-mono tw-text-xs">
                    {result.results.map((resultItem, index) => (
                        <Button
                            onClick={e => {
                                e.preventDefault()
                                onFileLinkClicked(resultItem.uri)
                            }}
                            variant="text"
                            key={`${resultItem.fileName}-${index}`}
                            className="tw-flex !tw-justify-start tw-py-1.5 tw-px-4 hover:tw-bg-zinc-900 tw-border-b tw-border-zinc-900 last:tw-border-b-0 tw-w-full !tw-items-center"
                        >
                            <span className="tw-w-6 tw-text-right tw-text-zinc-500 tw-mr-3 tw-pt-0.5 tw-select-none">
                                {index + 1}
                            </span>

                            <span className="tw-mr-2 tw-mt-0.5">{getIcon(resultItem.type)}</span>
                            <div className="tw-flex tw-flex-col">
                                <div className="tw-text-zinc-200">
                                    {resultItem.fileName}
                                    {resultItem.lineNumber && (
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

    return (
        <BaseCell
            icon={Search}
            headerContent={renderHeaderContent()}
            bodyContent={renderBodyContent()}
            className={className}
            isLoading={isLoading}
            defaultOpen={defaultOpen}
        />
    )
}
