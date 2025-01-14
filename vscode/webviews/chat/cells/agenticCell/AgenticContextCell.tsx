import type { ProcessingStep } from '@sourcegraph/cody-shared'
import { BrainIcon, CircleCheckIcon, CircleXIcon, Loader2Icon } from 'lucide-react'
import { type FC, type FunctionComponent, createContext, memo, useCallback, useState } from 'react'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../../components/shadcn/ui/accordion'
import { Cell } from '../Cell'
import { NON_HUMAN_CELL_AVATAR_SIZE } from '../messageCell/assistant/AssistantMessageCell'

export const __ProcessCellStorybookContext = createContext<{ initialOpen: boolean } | null>(null)

const CELL_NAME = 'agentic-context-items'
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

    const subHeader = !isContextLoading
        ? 'reviewed'
        : processes?.findLast(p => p.type !== 'tool')?.content || 'starting...'

    const statusClassName = processes?.some(p => p.error) ? 'tw-text-yellow-500' : 'tw-text-green-500'

    return (
        <div>
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
                                title="Agentic context"
                                className="tw-flex tw-items-center tw-gap-4"
                                disabled={!processes?.some(p => p.id)}
                            >
                                {isContextLoading ? (
                                    <Loader2Icon
                                        size={NON_HUMAN_CELL_AVATAR_SIZE}
                                        className="tw-animate-spin"
                                    />
                                ) : (
                                    <BrainIcon
                                        size={NON_HUMAN_CELL_AVATAR_SIZE}
                                        className={statusClassName}
                                    />
                                )}
                                <span className="tw-flex tw-items-baseline">
                                    Agentic context
                                    <span className="tw-opacity-60 tw-text-sm tw-ml-2">
                                        &mdash; {subHeader}
                                    </span>
                                </span>
                            </AccordionTrigger>
                        }
                        containerClassName={className}
                        contentClassName="tw-flex tw-flex-col tw-gap-4 tw-max-w-full"
                        data-testid="context"
                    >
                        <AccordionContent
                            className="tw-ml-6 tw-flex tw-flex-col tw-gap-2"
                            overflow={false}
                        >
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
        <div className="tw-flex tw-flex-col tw-gap-2">
            <div className="tw-flex tw-flex-col tw-gap-2">
                {processes.map(process => (
                    <ProcessItem
                        key={process.id}
                        process={process}
                        isContextLoading={isContextLoading}
                        headerIconClassName={headerIconClassName}
                    />
                ))}
            </div>
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
        <div className="tw-flex tw-items-center">
            <div className={`tw-mr-3 ${process.type === 'tool' ? 'tw-ml-4' : 'tw-ml-0'}`}>
                {process.type !== 'tool' ? (
                    <BrainIcon strokeWidth={1.5} size={14} className={headerIconClassName} />
                ) : process.state === 'error' ? (
                    <CircleXIcon
                        strokeWidth={1.5}
                        size={14}
                        className="tw-text-red-500 tw-drop-shadow-md"
                    />
                ) : process.state === 'success' || !isContextLoading ? (
                    <CircleCheckIcon strokeWidth={1.5} size={14} className="tw-text-green-500" />
                ) : (
                    <Loader2Icon strokeWidth={1.5} size={14} className="tw-animate-spin" />
                )}
            </div>
            <div className="tw-flex-grow tw-min-w-0">
                <div className="tw-truncate tw-max-w-full tw-text-sm">
                    <span className={process.type === 'tool' ? 'tw-font-normal' : 'tw-font-semibold'}>
                        {process.type !== 'tool' ? process.content : process.title ?? process.id}
                    </span>
                    {process.type === 'tool' && process.content && (
                        <span
                            className="tw-font-normal tw-ml-1 tw-truncate tw-max-w-full tw-text-xs tw-muted-foreground tw-opacity-80"
                            title="Query generated by agent"
                        >
                            ({process.content})
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
