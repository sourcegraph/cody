import type { ProcessingStep } from '@sourcegraph/cody-shared'
import { type FC, type FunctionComponent, memo } from 'react'

// const CELL_NAME = 'agentic-chat-items'

const DEFAULT_STATUS = 'Retrieving context'

/**
 * A component displaying the agentic chat status.
 * Only shows if there are tool steps in the action list.
 */
export const AgenticContextCell: FunctionComponent<{
    isContextLoading: boolean
    className?: string
    processes?: ProcessingStep[]
}> = memo(({ isContextLoading, processes }) => {
    const hasError = processes?.some(p => p.error) ? ' failed' : ''
    const toolSteps = processes?.filter(p => p.type === 'tool')
    const currentProcess = processes?.findLast(p => p.id === 'deep-cody')?.title
    const status = currentProcess || DEFAULT_STATUS + hasError

    if (!processes?.length) {
        return null
    }

    return (
        <div className="tw-bg-inherit tw-rounded-md tw-mt-2 tw-shadow tw-w-full">
            <div className="tw-text-xs tw-text-muted-foreground tw-mb-2 tw-font-semibold tw-uppercase tw-tracking-wider">
                {status}
                {toolSteps?.length && (
                    <span className="tw-float-right tw-text-xs tw-font-normal tw-text-muted-foreground">
                        {toolSteps.length} tool
                    </span>
                )}
            </div>
            {toolSteps?.length && (
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

    return (
        <div
            className="tw-flex tw-items-center tw-gap-3 tw-py-2 tw-border-b tw-border-border"
            style={isLast ? { borderBottom: 'none' } : {}}
        >
            <div className="tw-flex-1 tw-min-w-0">
                <div className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-font-medium tw-truncate">
                    <span className="tw-capitalize">{process.title || process.id}</span>
                </div>
                {process.content && (
                    <div className="tw-text-xs tw-text-muted-foreground tw-truncate">
                        {process.content}
                        {' - '}
                        {`${process?.items?.length ?? '0'} context items`}
                    </div>
                )}
            </div>
            <span className={`tw-ml-2 tw-w-3 tw-h-3 tw-rounded-full ${dotColor} tw-inline-block`} />
        </div>
    )
}
