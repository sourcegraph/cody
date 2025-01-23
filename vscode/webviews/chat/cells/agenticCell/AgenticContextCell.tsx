import type { ChatMessage, ProcessingStep } from '@sourcegraph/cody-shared'
import { BrainIcon, CircleXIcon, Loader2Icon, MessageSquare, Search } from 'lucide-react'
import { type FC, type FunctionComponent, createContext, memo, useCallback, useState } from 'react'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../../components/shadcn/ui/accordion'
import { Button } from '../../../components/shadcn/ui/button'
import { Cell } from '../Cell'

export const __ProcessCellStorybookContext = createContext<{ initialOpen: boolean } | null>(null)

const CELL_NAME = 'agentic-chat-items'
/**
 * A component displaying the agentic chat status.
 */
export const AgenticContextCell: FunctionComponent<{
    isContextLoading: boolean
    className?: string
    processes?: ProcessingStep[]
    intent: ChatMessage['intent']
    manuallySelected?: boolean
    onSwitchIntent?: () => void
}> = memo(({ className, isContextLoading, processes, intent, onSwitchIntent }) => {
    const [accordionValue, setAccordionValue] = useState<string | undefined>(undefined)

    const triggerAccordion = useCallback(() => {
        setAccordionValue(prev => {
            return prev ? '' : CELL_NAME
        })
    }, [])

    const hasError = processes?.some(p => p.error) ?? false
    const { title, icon: Icon, status } = getDisplayConfig(intent, isContextLoading, hasError, processes)
    const statusClassName = hasError ? 'tw-text-yellow-600' : 'tw-text-muted-foreground'

    const renderSwitchButton = () => {
        if (!['chat', 'search'].includes(intent || '')) {
            return null
        }

        return (
            <Button
                size="sm"
                variant="outline"
                className="tw-text-primary tw-flex tw-gap-2 tw-items-center tw-whitespace-nowrap"
                onClick={onSwitchIntent}
            >
                {intent === 'chat' ? (
                    <Search className="tw-size-6 tw-flex-shrink-0" />
                ) : (
                    <MessageSquare className="tw-size-6 tw-flex-shrink-0" />
                )}
                {intent === 'chat' ? 'Switch to search' : 'Switch to chat'}
            </Button>
        )
    }

    return (
        <div
            className="tw-flex tw-flex-col tw-justify-center tw-w-full tw-px-4 tw-gap-2 tw-border-b tw-border-border tw-text-sm tw-font-medium"
            style={{ background: 'var(--vscode-editor-background)' }}
        >
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
                            <div className="tw-flex tw-justify-between tw-items-center tw-w-full">
                                <AccordionTrigger
                                    onClick={() => triggerAccordion()}
                                    title={title}
                                    className="tw-flex tw-justify-center tw-items-center tw-gap-4"
                                    disabled={!processes?.some(p => p.id)}
                                >
                                    {isContextLoading ? (
                                        <Loader2Icon size={16} className="tw-animate-spin" />
                                    ) : (
                                        <Icon size={16} className={statusClassName} />
                                    )}
                                    <span className="tw-flex tw-items-baseline">
                                        {title}
                                        <span className="tw-opacity-60 tw-text-sm tw-ml-2">
                                            — {status.toLowerCase()}
                                        </span>
                                    </span>
                                </AccordionTrigger>{' '}
                                {renderSwitchButton()}
                            </div>
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
            </Accordion>{' '}
        </div>
    )
})
const CHAT_STATES = {
    search: {
        title: 'Search',
        icon: Search,
        states: {
            loading: 'searching...',
            completed: 'completed',
            failed: 'failed',
            default: 'reviewing',
        },
    },
    chat: {
        title: 'Agentic Chat',
        icon: BrainIcon,
        states: {
            loading: 'reviewing...',
            completed: 'completed',
            failed: 'failed',
            default: 'reviewing',
        },
    },
} as const

export const getDisplayConfig = (
    intent: ChatMessage['intent'],
    isContextLoading: boolean,
    hasError: boolean,
    processes?: ProcessingStep[]
) => {
    const config = CHAT_STATES[intent === 'search' ? 'search' : 'chat']

    const status = !isContextLoading
        ? hasError
            ? config.states.failed
            : config.states.completed
        : intent === 'search'
          ? config.states.loading
          : processes?.findLast(p => p.type !== 'tool' && p.type !== 'confirmation')?.title ||
            config.states.default

    return {
        title: config.title,
        icon: config.icon,
        status,
    }
}
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
