import type { ContextItem, Model, RankedContext } from '@sourcegraph/cody-shared'
import { pluralize } from '@sourcegraph/cody-shared'
import { DeepCodyAgentID } from '@sourcegraph/cody-shared/src/models/client'
import { MENTION_CLASS_NAME } from '@sourcegraph/prompt-editor'
import { clsx } from 'clsx'
import { BrainIcon, MessagesSquareIcon } from 'lucide-react'
import { type FunctionComponent, createContext, memo, useCallback, useContext, useState } from 'react'
import { FileLink } from '../../../components/FileLink'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../../components/shadcn/ui/accordion'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/shadcn/ui/tooltip'
import { useTelemetryRecorder } from '../../../utils/telemetry'
import { useConfig } from '../../../utils/useConfig'
import { LoadingDots } from '../../components/LoadingDots'
import { Cell } from '../Cell'
import styles from './ContextCell.module.css'

export const __ContextCellStorybookContext = createContext<{
    initialOpen: boolean
} | null>(null)

/**
 * A component displaying the context for a human message.
 */
export const ContextCell: FunctionComponent<{
    isContextLoading: boolean
    contextItems: ContextItem[] | undefined
    contextAlternatives?: RankedContext[]

    isForFirstMessage: boolean

    model?: Model['id']
    className?: string

    defaultOpen?: boolean
    agent?: string
}> = memo(
    ({
        contextItems,
        contextAlternatives,

        model,
        isForFirstMessage,
        className,
        defaultOpen,
        isContextLoading,
        agent,
    }) => {
        const __storybook__initialOpen = useContext(__ContextCellStorybookContext)?.initialOpen ?? false

        const [selectedAlternative, setSelectedAlternative] = useState<number | undefined>(undefined)
        const incrementSelectedAlternative = useCallback(
            (increment: number): void => {
                if (!contextAlternatives) {
                    return
                }
                const basis = contextAlternatives.length + 1
                const idx = selectedAlternative === undefined ? 0 : selectedAlternative + 1
                const newIdx = (idx + increment + basis) % basis
                setSelectedAlternative(newIdx - 1 < 0 ? undefined : newIdx - 1)
            },
            [contextAlternatives, selectedAlternative]
        )
        const nextSelectedAlternative = useCallback(
            () => incrementSelectedAlternative(1),
            [incrementSelectedAlternative]
        )
        const prevSelectedAlternative = useCallback(
            () => incrementSelectedAlternative(-1),
            [incrementSelectedAlternative]
        )

        let contextItemsToDisplay = contextItems
        if (selectedAlternative !== undefined && contextAlternatives) {
            contextItemsToDisplay = contextAlternatives[selectedAlternative].items
        }

        const { usedContext, excludedContext, itemCountLabel, excludedContextInfo } = getContextInfo(
            contextItemsToDisplay,
            isForFirstMessage
        )

        const [accordionValue, setAccordionValue] = useState(
            ((__storybook__initialOpen || defaultOpen) && 'item-1') || undefined
        )

        const triggerAccordion = useCallback(() => {
            setAccordionValue(prev => {
                if (!prev) {
                    telemetryRecorder.recordEvent('cody.contextCell', 'opened', {
                        metadata: {
                            fileCount: new Set(usedContext.map(file => file.uri.toString())).size,
                            excludedAtContext: excludedContext.length,
                        },
                    })
                }

                return prev ? '' : 'item-1'
            })
        }, [excludedContext.length, usedContext])

        const {
            config: { internalDebugContext },
        } = useConfig()

        const telemetryRecorder = useTelemetryRecorder()

        const isAgenticChat = model?.includes(DeepCodyAgentID) || agent === DeepCodyAgentID

        // Text for top header text
        const headerText: { main: string; sub?: string } = {
            main: isAgenticChat ? 'Agentic context' : isContextLoading ? 'Fetching context' : 'Context',
            sub: isContextLoading
                ? isAgenticChat
                    ? 'Thinking…'
                    : 'Retrieving codebase files…'
                : contextItems === undefined
                  ? 'none requested'
                  : contextItems.length === 0
                    ? isAgenticChat
                        ? 'none'
                        : 'none fetched'
                    : itemCountLabel,
        }

        const hasContent =
            isContextLoading ||
            (contextItemsToDisplay && contextItemsToDisplay.length > 0) ||
            !isForFirstMessage ||
            isAgenticChat

        return (
            <div className="tw-flex tw-flex-col tw-justify-center tw-w-full tw-gap-2 tw-py-1">
                <Accordion
                    type="single"
                    collapsible={true}
                    defaultValue={((__storybook__initialOpen || defaultOpen) && 'item-1') || undefined}
                    asChild={true}
                    value={accordionValue}
                >
                    <AccordionItem value="item-1" asChild>
                        <Cell
                            header={
                                <AccordionTrigger
                                    onClick={triggerAccordion}
                                    title={itemCountLabel}
                                    className="tw-flex tw-items-center tw-gap-4"
                                    disabled={isContextLoading || !hasContent}
                                >
                                    <span className="tw-flex tw-items-baseline">
                                        {headerText.main}
                                        {headerText.sub && (
                                            <span className="tw-opacity-60 tw-text-sm tw-ml-2">
                                                — {headerText.sub}
                                            </span>
                                        )}
                                    </span>
                                </AccordionTrigger>
                            }
                            containerClassName={className}
                            contentClassName="tw-flex tw-flex-col tw-gap-4 tw-max-w-full"
                            data-testid="context"
                        >
                            {isContextLoading && !isAgenticChat ? (
                                <LoadingDots />
                            ) : (
                                <>
                                    <AccordionContent
                                        className="tw-flex tw-flex-col tw-gap-2"
                                        overflow={false}
                                    >
                                        {internalDebugContext && contextAlternatives && (
                                            <div>
                                                <button onClick={prevSelectedAlternative} type="button">
                                                    ←
                                                </button>
                                                <button onClick={nextSelectedAlternative} type="button">
                                                    →
                                                </button>{' '}
                                                Ranking mechanism:{' '}
                                                {selectedAlternative === undefined
                                                    ? 'actual'
                                                    : `${
                                                          contextAlternatives[selectedAlternative]
                                                              .strategy
                                                      }: (${(selectedAlternative ?? -1) + 1} of ${
                                                          contextAlternatives.length
                                                      })`}
                                            </div>
                                        )}
                                        <ul className="tw-list-none tw-flex tw-flex-col tw-gap-2">
                                            {contextItemsToDisplay?.map((item, i) => (
                                                <li
                                                    // biome-ignore lint/correctness/useJsxKeyInIterable:
                                                    // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                                                    key={i}
                                                    data-testid="context-item"
                                                >
                                                    <FileLink
                                                        uri={item.uri}
                                                        repoName={item.repoName}
                                                        revision={item.revision}
                                                        source={item.source}
                                                        range={item.range}
                                                        title={item.title}
                                                        isTooLarge={item.isTooLarge}
                                                        isTooLargeReason={item.isTooLargeReason}
                                                        isIgnored={item.isIgnored}
                                                        providerUri={
                                                            item.type === 'openctx'
                                                                ? item.providerUri
                                                                : undefined
                                                        }
                                                        linkClassName={styles.contextItemLink}
                                                        className={clsx(
                                                            styles.linkContainer,
                                                            MENTION_CLASS_NAME
                                                        )}
                                                    />
                                                    {internalDebugContext &&
                                                        item.metadata &&
                                                        item.metadata.length > 0 && (
                                                            <span className={styles.contextItemMetadata}>
                                                                {item.metadata.join(', ')}
                                                            </span>
                                                        )}
                                                </li>
                                            ))}

                                            {!isForFirstMessage && (
                                                <span
                                                    className={clsx(
                                                        styles.contextItem,
                                                        'tw-flex tw-items-center tw-gap-2'
                                                    )}
                                                >
                                                    <MessagesSquareIcon size={14} className="tw-ml-1" />
                                                    <span>
                                                        Prior messages and context in this conversation
                                                    </span>
                                                </span>
                                            )}
                                            {!isContextLoading && isAgenticChat && (
                                                <li>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span
                                                                className={clsx(
                                                                    styles.contextItem,
                                                                    'tw-flex tw-items-center tw-gap-2 tw-text-muted-foreground'
                                                                )}
                                                            >
                                                                <BrainIcon
                                                                    size={14}
                                                                    className="tw-ml-1"
                                                                />
                                                                <span>
                                                                    Selected from agentic context
                                                                </span>
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="bottom">
                                                            Fetches additional context to improve
                                                            response quality when needed
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </li>
                                            )}
                                        </ul>
                                    </AccordionContent>
                                </>
                            )}
                        </Cell>
                    </AccordionItem>
                </Accordion>

                {contextItemsToDisplay && excludedContextInfo.length > 0 && (
                    <div className="tw-mt-2 tw-text-muted-foreground">
                        {excludedContextInfo.map(message => (
                            <ExcludedContextWarning key={message} message={message} />
                        ))}
                    </div>
                )}
            </div>
        )
    }
)
const getContextInfo = (items?: ContextItem[], isFirst?: boolean) => {
    const { usedContext, excludedContext, count } = (items ?? []).reduce(
        (acc, item) => {
            if (item.isTooLarge || item.isIgnored) {
                acc.excludedContext.push(item)
                acc.count[item.isTooLarge ? 'token' : 'filtered']++
            } else {
                acc.usedContext.push(item)
                acc.count.used++
            }
            return acc
        },
        {
            usedContext: [] as ContextItem[],
            excludedContext: [] as ContextItem[],
            count: { used: 0, token: 0, filtered: 0 },
        }
    )

    const itemCountLabel = `${count.used} ${isFirst ? '' : 'new '}${pluralize('item', count.used)}`

    return {
        usedContext,
        excludedContext,
        itemCountLabel,
        excludedContextInfo: generateExcludedInfo(count.token, count.filtered),
    }
}

const TEMPLATES = {
    filter: 'filtered out by Cody Context Filters. Please contact your site admin for details.',
    token: 'were retrieved but not used because they exceed the token limit. Learn more about token limits ',
} as const

function generateExcludedInfo(token: number, filter: number): string[] {
    return [
        token > 0 && `${token} ${token === 1 ? 'item' : 'items'} ${TEMPLATES.token}`,
        filter > 0 && `${filter} ${filter === 1 ? 'item' : 'items'} ${TEMPLATES.filter}`,
    ].filter(Boolean) as string[]
}

const ExcludedContextWarning: React.FC<{ message: string }> = ({ message }) => (
    <div className="tw-flex tw-gap-2 tw-my-2 tw-items-center">
        <i className="codicon codicon-warning" />
        <span>
            {message}
            {message.includes(TEMPLATES.token) && (
                <a href="https://sourcegraph.com/docs/cody/core-concepts/token-limits">here</a>
            )}
            .
        </span>
    </div>
)
