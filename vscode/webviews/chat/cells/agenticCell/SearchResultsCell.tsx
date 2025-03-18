import type { SearchResultView } from '@sourcegraph/cody-shared'
import { ChevronDown, ChevronRight, FileCode, FileText, FolderOpen, Search } from 'lucide-react'
import { type FC, useState } from 'react'
import { Badge } from '../../../components/shadcn/ui/badge'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '../../../components/shadcn/ui/collapsible'
import { Skeleton } from '../../../components/shadcn/ui/skeleton'
import { cn } from '../../../components/shadcn/utils'

interface SearchResultsProps {
    result: SearchResultView
    className?: string
    isLoading?: boolean
}

export const SearchResultsCell: FC<SearchResultsProps> = ({ result, className, isLoading = false }) => {
    const [isOpen, setIsOpen] = useState(false)

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

    return (
        <div className={cn('tw-rounded-md tw-border tw-border-border tw-w-full', className)}>
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
                                <Search
                                    size={16}
                                    className="tw-flex-shrink-0 tw-text-zinc-400 tw-animate-pulse"
                                />

                                <Skeleton className="tw-h-4 tw-w-40 tw-bg-zinc-800 tw-animate-pulse" />
                                <Skeleton className="tw-h-5 tw-w-12 tw-ml-2 tw-bg-zinc-800 tw-animate-pulse tw-rounded-full" />
                            </div>

                            <div className="tw-animate-pulse">
                                <ChevronDown size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                                <Search size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                                {/* <span className="tw-font-medium">Search results: </span> */}
                                <code className="tw-px-1.5 tw-py-0.5 tw-bg-zinc-800 tw-rounded tw-text-zinc-200 tw-font-mono tw-text-xs">
                                    {result.query}
                                </code>
                                <Badge
                                    variant="outline"
                                    className="tw-ml-2 tw-bg-zinc-800 tw-text-zinc-200"
                                >
                                    {result.results.length} results
                                </Badge>
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
                    ) : (
                        <div className="tw-overflow-x-auto tw-bg-zinc-950 tw-p-0">
                            <div className="tw-font-mono tw-text-xs">
                                {result.results.map((result, index) => (
                                    <div
                                        // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                                        key={index}
                                        className="tw-flex tw-items-start tw-py-1.5 tw-px-4 hover:tw-bg-zinc-900 tw-border-b tw-border-zinc-900 last:tw-border-b-0"
                                    >
                                        <span className="tw-w-6 tw-text-right tw-text-zinc-500 tw-mr-3 tw-pt-0.5 tw-select-none">
                                            {index + 1}
                                        </span>

                                        <span className="tw-mr-2 tw-mt-0.5">{getIcon(result.type)}</span>
                                        <div className="tw-flex tw-flex-col">
                                            <div className="tw-text-zinc-200">
                                                {result.fileName}
                                                {result.lineNumber && (
                                                    <span className="tw-text-zinc-500">
                                                        :{result.lineNumber}
                                                    </span>
                                                )}
                                            </div>
                                            {result.preview && (
                                                <div className="tw-text-zinc-400 tw-mt-1 tw-pl-4 tw-border-l tw-border-zinc-800">
                                                    {result.preview}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CollapsibleContent>
            </Collapsible>
        </div>
    )
}
