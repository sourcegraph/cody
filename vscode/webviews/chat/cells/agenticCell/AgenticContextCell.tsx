import type { ContextItem, ProcessingStep } from '@sourcegraph/cody-shared'
import { Search, SearchX } from 'lucide-react'
import { type FC, type FunctionComponent, memo } from 'react'

const CONTEXT_RETRIEVAL_TITLES = {
    error: 'Context retrieval failed',
    success: 'Context retrieved',
    start: 'Reviewing context',
    none: 'No relevant context found',
}

/**
 * A component displaying the agentic chat status.
 * Only shows if there are tool steps in the action list.
 */
export const AgenticContextCell: FunctionComponent<{
    isContextLoading: boolean
    contextItems?: ContextItem[]
    className?: string
    processes?: ProcessingStep[]
}> = memo(({ contextItems, isContextLoading, processes }) => {
    // Compute derived values only when needed
    const hasError = processes?.some(p => p.error) || false
    const toolSteps = processes?.filter(p => p.type === 'tool') || []

    // Determine title based on state
    const title = isContextLoading
        ? processes?.findLast(p => p.id === 'deep-cody')?.title || CONTEXT_RETRIEVAL_TITLES.start
        : hasError
          ? CONTEXT_RETRIEVAL_TITLES.error
          : contextItems?.length
            ? CONTEXT_RETRIEVAL_TITLES.success
            : CONTEXT_RETRIEVAL_TITLES.none

    return (
        <div className="tw-bg-inherit tw-rounded-md tw-mt-2 tw-shadow tw-w-full">
            <div className="tw-text-xs tw-text-muted-foreground tw-mb-2 tw-font-semibold tw-uppercase tw-tracking-wider">
                {title}
                {hasError && (
                    <span className="tw-float-right tw-text-xs tw-font-normal tw-text-muted-foreground">
                        FAILED
                    </span>
                )}
            </div>
            {toolSteps.length > 0 && (
                <div className="tw-flex tw-flex-col tw-w-full tw-gap-2">
                    {toolSteps.map((process, i) => (
                        <ActionRow
                            key={process.id || i}
                            process={process}
                            isLast={i === toolSteps.length - 1}
                            isContextLoading={isContextLoading}
                        />
                    ))}
                </div>
            )}
        </div>
    )
})

const ActionRow: FC<{
    process: ProcessingStep
    isLast: boolean
    isContextLoading: boolean
}> = ({ process, isLast, isContextLoading }) => {
    let dotColor = 'tw-bg-orange-400'

    // Determine dot color
    if (process.state === 'error') {
        dotColor = 'tw-bg-red-500'
    } else if (process.state === 'success' || !isContextLoading) {
        dotColor = 'tw-bg-green-500'
    }

    const Icon = process.state === 'error' ? SearchX : Search

    return (
        <div
            className="tw-flex tw-items-center tw-gap-3 tw-py-2"
            style={isLast ? { borderBottom: 'none' } : {}}
        >
            <div className="tw-flex-1 tw-min-w-0 tw-flex tw-flex-col tw-gap-4">
                <div className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-font-medium tw-truncate">
                    <span
                        className={`tw-ml-2 tw-w-3 tw-h-3 tw-rounded-full ${dotColor} tw-inline-block`}
                    />
                    <span className="tw-capitalize">{process.title || process.id}</span>
                </div>
                {process.content && (
                    <div
                        className="tw-text-xs tw-text-muted-foreground tw-truncate tw-inline-flex"
                        title={process.content}
                    >
                        <Icon size={14} className="tw-mr-2" /> {process.content}
                    </div>
                )}
            </div>
        </div>
    )
}
