import type { ProcessingStep } from '@sourcegraph/cody-shared'
import { BrainIcon, CircleXIcon, Loader2Icon } from 'lucide-react'
import { type FC, type FunctionComponent, memo, useCallback, useState } from 'react'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../../components/shadcn/ui/accordion'
import { Cell } from '../Cell'

const CELL_NAME = 'agentic-chat-items'
/**
 * A component displaying the agentic chat status.
 */
export const AgenticContextCell: FunctionComponent<{
    isContextLoading: boolean
    className?: string
    processes?: ProcessingStep[]
}> = memo(({ className, isContextLoading, processes }) => {
    const [accordionValue, setAccordionValue] = useState<string | undefined>(undefined)

    const triggerAccordion = useCallback(() => {
        setAccordionValue(prev => {
            return prev ? '' : CELL_NAME
        })
    }, [])

    const hasError = processes?.some(p => p.error)
    const status = !isContextLoading
        ? hasError
            ? 'failed'
            : 'completed'
        : processes?.findLast(p => p.type !== 'tool' && p.type !== 'confirmation')?.title || 'reviewing'
    const statusClassName = hasError ? 'tw-text-yellow-600' : 'tw-text-muted-foreground'

    return (
        <div className="tw-flex tw-flex-col tw-justify-center tw-w-full tw-gap-2 tw-py-1">
            <Accordion
                type="single"
                collapsible={true}
                defaultValue={undefined}
                asChild={true}
                value={accordionValue}
            >
                <AccordionItem value={CELL_NAME} asChild>
                    <Cell
                        header={
                            <AccordionTrigger
                                onClick={() => triggerAccordion()}
                                title="Agentic chat"
                                className="tw-flex tw-justify-center tw-items-center tw-gap-4"
                                disabled={!processes?.some(p => p.id)}
                            >
                                {isContextLoading ? (
                                    <Loader2Icon size={16} className="tw-animate-spin" />
                                ) : (
                                    <BrainIcon size={16} className={statusClassName} />
                                )}
                                <span className="tw-flex tw-items-baseline">
                                    Agentic chat
                                    <span className="tw-opacity-60 tw-text-sm tw-ml-2">
                                        &mdash; {status.toLowerCase()}
                                    </span>
                                </span>
                            </AccordionTrigger>
                        }
                        containerClassName={className}
                        contentClassName="tw-flex tw-flex-col tw-gap-4 tw-max-w-full"
                        data-testid="context"
                    >
                        <AccordionContent className="tw-flex tw-flex-col tw-gap-4" overflow={false}>
                            {processes && (
                                <ProcessList
                                    processes={processes}
                                    isContextLoading={isContextLoading}
                                    headerIconClassName={statusClassName}
                                />
                            )}
                        </AccordionContent>
                    </Cell>
                </AccordionItem>
            </Accordion>
        </div>
    )
})

const ProcessList: FC<{
    processes: ProcessingStep[]
    isContextLoading: boolean
    headerIconClassName?: string
}> = ({ processes, isContextLoading, headerIconClassName }) => {
    return (
        <div className="tw-flex tw-flex-col tw-gap-3 tw-ml-[1rem]">
            {processes.map(process => (
                <ProcessItem
                    key={process.id}
                    process={process}
                    isContextLoading={isContextLoading}
                    headerIconClassName={headerIconClassName}
                />
            ))}
        </div>
    )
}

const ProcessItem: FC<{
    process: ProcessingStep
    isContextLoading: boolean
    headerIconClassName?: string
}> = ({ process, isContextLoading, headerIconClassName }) => {
    if (!process.id || process.type === 'confirmation') {
        return null
    }

    return (
        <div className="tw-flex tw-items-center tw-gap-3 tw-p-1">
            <div className={process.type === 'tool' ? 'tw-ml-[1rem] tw-font-sm' : 'tw-ml-0'}>
                {process.type !== 'tool' ? (
                    <BrainIcon strokeWidth={1.25} size={12} className={headerIconClassName} />
                ) : process.state === 'error' ? (
                    <CircleXIcon strokeWidth={1.5} size={12} className="tw-text-red-500" />
                ) : process.state === 'pending' && isContextLoading ? (
                    <Loader2Icon strokeWidth={1.5} size={12} className="tw-animate-spin" />
                ) : null}
            </div>
            <div className="tw-flex-grow tw-min-w-0">
                <div className="tw-truncate tw-max-w-full tw-text-sm">
                    <span>{process.type !== 'tool' ? process.title : process.title ?? process.id}</span>
                    {process.content && (
                        <span
                            className="tw-ml-2 tw-truncate tw-max-w-full tw-text-xs tw-muted-foreground tw-opacity-60"
                            title={process.type === 'tool' ? 'agentic chat query' : process.content}
                        >
                            ({process.content})
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
