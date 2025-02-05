import type { ChatMessage, ContextItem, ProcessingStep } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import {
    BrainIcon,
    Check,
    CircleXIcon,
    Ellipsis,
    Loader2Icon,
    MessageSquare,
    Search,
} from 'lucide-react'
import { type FC, type FunctionComponent, createContext, memo, useState } from 'react'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../../components/shadcn/ui/accordion'
import { Button } from '../../../components/shadcn/ui/button'
import { Cell } from '../Cell'
import { ContextList } from '../contextCell/ContextList'
import styles from './AgenticContextCell.module.css'
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
    contextItems?: ContextItem[]
    isForFirstMessage: boolean
    model?: string
    experimentalOneBoxEnabled?: boolean
}> = memo(
    ({
        className,
        isContextLoading,
        processes,
        intent,
        onSwitchIntent,
        contextItems,
        isForFirstMessage,
        model,
        experimentalOneBoxEnabled,
    }) => {
        const [accordionValue, setAccordionValue] = useState<string | undefined>(() => {
            return localStorage.getItem('agenticContextCell.accordionValue') || CELL_NAME
        })

        const hasError = processes?.some(p => p.error) ?? false
        const {
            title,
            icon: Icon,
            status,
        } = getDisplayConfig(intent, isContextLoading, hasError, processes)
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
            <div className="tw-flex tw-flex-col tw-justify-center tw-w-full tw-gap-0 tw-text-sm tw-font-medium">
                <Accordion
                    type="single"
                    collapsible={true}
                    value={accordionValue}
                    onValueChange={value => {
                        setAccordionValue(value)
                        localStorage.setItem('agenticContextCell.accordionValue', value || '')
                    }}
                >
                    <AccordionItem value={CELL_NAME} asChild>
                        <Cell
                            header={
                                <div className="tw-flex tw-justify-between tw-items-center tw-w-full">
                                    <AccordionTrigger
                                        title={title}
                                        className="tw-flex tw-justify-center tw-items-center tw-gap-3"
                                        disabled={!processes?.some(p => p.id)}
                                        data-state={accordionValue === CELL_NAME ? 'open' : 'closed'}
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
                            contentClassName="tw-flex tw-flex-col tw-gap-2 tw-max-w-full"
                            data-testid="context"
                        >
                            <AccordionContent
                                className="tw-flex tw-flex-col tw-gap-2 tw-pb-4"
                                overflow={false}
                            >
                                {processes && (
                                    <ProcessList
                                        processes={processes}
                                        isContextLoading={isContextLoading}
                                        headerIconClassName={statusClassName}
                                    />
                                )}
                                {!isContextLoading && (
                                    <div className="tw-flex tw-flex-col tw-ml-[1rem]">
                                        <ContextList
                                            contextItems={contextItems}
                                            isForFirstMessage={false}
                                            isAgenticChat={intent === 'chat'}
                                            isSearchResponse={true}
                                        />
                                    </div>
                                )}
                            </AccordionContent>{' '}
                        </Cell>
                    </AccordionItem>
                </Accordion>
            </div>
        )
    }
)
const CHAT_STATES = {
    search: {
        title: 'Search',
        icon: Search,
        states: {
            loading: 'searching...',
            completed: 'completed',
            failed: 'failed',

            default: 'searching',
        },
    },
    chat: {
        title: 'Agentic Chat',
        icon: BrainIcon,
        states: {
            loading: 'thinking...',
            completed: 'completed',
            failed: 'failed',

            default: 'thinking',
        },
    },
} as const

export const getDisplayConfig = (
    intent: ChatMessage['intent'],
    isContextLoading: boolean,
    hasError: boolean,
    processes?: ProcessingStep[],
    contextItems?: ContextItem[]
) => {
    const config = CHAT_STATES[intent === 'search' ? 'search' : 'chat']

    const status = !isContextLoading
        ? hasError
            ? config.states.failed
            : config.states.completed
        : config.states.loading
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
        <div className="tw-flex tw-flex-col tw-ml-[1rem]">
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
        <div
            className={`tw-flex tw-items-center tw-gap-4 tw-p-1 ${styles.processItem} ${styles.fadeIn}`}
        >
            <div
                className={`${process.type === 'tool' ? 'tw-ml-[1rem] tw-font-sm' : 'tw-ml-0'} ${
                    styles.stateIcon
                }`}
            >
                {process.type !== 'tool' ? (
                    process.state === 'pending' ? (
                        <Ellipsis strokeWidth={1.5} size={12} className={headerIconClassName} />
                    ) : process.state === 'success' ? (
                        <Check strokeWidth={1.5} size={12} className={headerIconClassName} />
                    ) : (
                        <BrainIcon strokeWidth={1.5} size={12} className={headerIconClassName} />
                    )
                ) : process.state === 'error' ? (
                    <CircleXIcon strokeWidth={1.5} size={12} className="tw-text-red-500" />
                ) : process.state === 'pending' && isContextLoading ? (
                    <Loader2Icon strokeWidth={1.5} size={12} className="tw-animate-spin" />
                ) : null}
            </div>
            <div className="tw-flex-grow tw-min-w-0">
                <div
                    className={clsx('tw-truncate tw-max-w-full tw-text-sm', styles.stateText, {
                        'tw-text-red-700': process.state === 'error',
                        'tw-text-muted-foreground': process.state === 'success' || !process.state,
                        'tw-text-foreground': process.state === 'pending',
                    })}
                >
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
