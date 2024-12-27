import type {
    ChatMessage,
    ContextItem,
    Model,
    ProcessingStep,
    RankedContext,
} from '@sourcegraph/cody-shared'
import { pluralize } from '@sourcegraph/cody-shared'
import { MENTION_CLASS_NAME } from '@sourcegraph/prompt-editor'
import { clsx } from 'clsx'
import {
    BrainIcon,
    CheckCircle,
    CircleXIcon,
    FilePenLine,
    Loader2Icon,
    MessagesSquareIcon,
} from 'lucide-react'
import {
    type FC,
    type FunctionComponent,
    createContext,
    memo,
    useCallback,
    useContext,
    useMemo,
    useState,
} from 'react'
import { FileLink } from '../../../components/FileLink'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../../components/shadcn/ui/accordion'
import { Button } from '../../../components/shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/shadcn/ui/tooltip'
import { SourcegraphLogo } from '../../../icons/SourcegraphLogo'
import { useTelemetryRecorder } from '../../../utils/telemetry'
import { useConfig } from '../../../utils/useConfig'
import { LoadingDots } from '../../components/LoadingDots'
import { Cell } from '../Cell'
import { NON_HUMAN_CELL_AVATAR_SIZE } from '../messageCell/assistant/AssistantMessageCell'
import styles from './ContextCell.module.css'

export const __ContextCellStorybookContext = createContext<{ initialOpen: boolean } | null>(null)

/**
 * A component displaying the context for a human message.
 */
export const ContextCell: FunctionComponent<{
    isContextLoading: boolean
    contextItems: ContextItem[] | undefined
    contextAlternatives?: RankedContext[]
    resubmitWithRepoContext?: () => Promise<void>

    isForFirstMessage: boolean

    model?: Model['id']
    className?: string

    defaultOpen?: boolean
    intent: ChatMessage['intent']

    onManuallyEditContext: () => void
    editContextNode: React.ReactNode
    experimentalOneBoxEnabled?: boolean
    steps?: ProcessingStep[]
}> = memo(
    ({
        contextItems,
        contextAlternatives,
        resubmitWithRepoContext,

        model,
        isForFirstMessage,
        className,
        defaultOpen,
        isContextLoading,
        onManuallyEditContext,
        editContextNode,
        intent,
        experimentalOneBoxEnabled,
        steps,
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

        const onEditContext = useCallback(() => {
            triggerAccordion()
            onManuallyEditContext()
        }, [triggerAccordion, onManuallyEditContext])

        const {
            config: { internalDebugContext },
        } = useConfig()

        const telemetryRecorder = useTelemetryRecorder()

        const isDeepCodyEnabled = useMemo(() => model?.includes('deep-cody'), [model])

        // Text for top header text
        const headerText: { main: string; sub?: string } = {
            main:
                experimentalOneBoxEnabled && !intent
                    ? 'Reviewing query'
                    : isContextLoading
                      ? 'Fetching context'
                      : 'Context',
            sub:
                experimentalOneBoxEnabled && !intent
                    ? 'Figuring out query intent...'
                    : isContextLoading
                      ? isDeepCodyEnabled
                          ? 'Thinking…'
                          : 'Retrieving codebase files…'
                      : contextItems === undefined
                        ? 'none requested'
                        : contextItems.length === 0
                          ? 'none fetched'
                          : itemCountLabel,
        }

        return (
            <div>
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
                                    disabled={isContextLoading && steps === undefined}
                                >
                                    <SourcegraphLogo
                                        width={NON_HUMAN_CELL_AVATAR_SIZE}
                                        height={NON_HUMAN_CELL_AVATAR_SIZE}
                                    />
                                    <span className="tw-flex tw-items-baseline">
                                        {headerText.main}
                                        {headerText.sub && (
                                            <span className="tw-opacity-60 tw-text-sm tw-ml-2">
                                                &mdash; {headerText.sub}
                                            </span>
                                        )}
                                    </span>
                                </AccordionTrigger>
                            }
                            containerClassName={className}
                            contentClassName="tw-flex tw-flex-col tw-gap-4 tw-max-w-full"
                            data-testid="context"
                        >
                            {isContextLoading && !isDeepCodyEnabled ? (
                                <LoadingDots />
                            ) : (
                                <>
                                    <AccordionContent className="tw-ml-6" overflow={false}>
                                        {isDeepCodyEnabled && (
                                            <ProcessingStepList
                                                steps={steps ?? []}
                                                isContextLoading={isContextLoading}
                                            />
                                        )}
                                        <div className={styles.contextSuggestedActions}>
                                            {contextItems && contextItems.length > 0 && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className={clsx(
                                                        'tw-pr-4',
                                                        styles.contextItemEditButton
                                                    )}
                                                    onClick={onEditContext}
                                                >
                                                    {editContextNode}
                                                </Button>
                                            )}
                                            {resubmitWithRepoContext && !isDeepCodyEnabled && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={resubmitWithRepoContext}
                                                    type="button"
                                                >
                                                    Resend with current repository context
                                                </Button>
                                            )}
                                        </div>
                                        {internalDebugContext && contextAlternatives && (
                                            <div>
                                                <button onClick={prevSelectedAlternative} type="button">
                                                    &larr;
                                                </button>
                                                <button onClick={nextSelectedAlternative} type="button">
                                                    &rarr;
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
                                        <ul className="tw-list-none tw-flex tw-flex-col tw-gap-2 tw-pt-2">
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
                                            {!isContextLoading && (
                                                <li>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span
                                                                className={clsx(
                                                                    styles.contextItem,
                                                                    'tw-flex tw-items-center tw-gap-2'
                                                                )}
                                                            >
                                                                <BrainIcon
                                                                    size={14}
                                                                    className="tw-ml-1"
                                                                />
                                                                <span>
                                                                    {isDeepCodyEnabled
                                                                        ? 'Reviewed by Deep Cody'
                                                                        : 'Public knowledge'}
                                                                </span>
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="bottom">
                                                            {isDeepCodyEnabled ? (
                                                                <span>
                                                                    Deep Cody fetches additional context
                                                                    to improve response quality when
                                                                    needed
                                                                </span>
                                                            ) : (
                                                                <span>
                                                                    Information and general reasoning
                                                                    capabilities trained into the model{' '}
                                                                    {model && <code>{model}</code>}
                                                                </span>
                                                            )}
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

export const EditContextButtonSearch = (
    <>
        <FilePenLine size={'1em'} />
        <div>Edit results</div>
    </>
)

export const EditContextButtonChat = (
    <>
        <FilePenLine size={'1em'} />
        <div>Edit context</div>
    </>
)

const ProcessingStepList: FC<{ steps: ProcessingStep[]; isContextLoading: boolean }> = ({
    steps,
    isContextLoading,
}) => {
    return (
        <div className="tw-flex tw-flex-col tw-mb-2">
            <div className="tw-flex tw-flex-col tw-mb-2">
                {steps.map(step => (
                    <ProcessingStepItem key={step.id} step={step} isContextLoading={isContextLoading} />
                ))}
            </div>
            {isContextLoading && (
                <div className="tw-flex tw-items-center tw-rounded-md tw-bg-muted-transparent tw-p-4">
                    {isContextLoading && <LoadingDots />}
                    <div className="tw-ml-4 tw-text-sm">
                        May take a few seconds to fetch relevant context to improve response quality
                    </div>
                </div>
            )}{' '}
        </div>
    )
}

const ProcessingStepItem: FC<{ step: ProcessingStep; isContextLoading: boolean }> = ({
    step,
    isContextLoading,
}) => {
    if (!step.id && !step.content) {
        return null
    }

    return (
        <div className="tw-border-l-4 tw-border-slate-500 tw-px-4" role="status">
            <div className="tw-bg-muted-transparent tw-mx-4 tw-my-2 tw-py-2 tw-flex tw-items-center tw-rounded-md">
                <div className="tw-mx-4">
                    {step.status === 'pending' && isContextLoading ? (
                        <Loader2Icon
                            strokeWidth={2}
                            size={14}
                            className="tw-mr-2 tw-h-6 tw-w-6 tw-animate-spin"
                        />
                    ) : step.status === 'error' ? (
                        <CircleXIcon strokeWidth={2} size={14} className="tw-text-red-400" />
                    ) : (
                        <CheckCircle strokeWidth={2} size={14} className="tw-text-green-400" />
                    )}
                </div>
                <div className="tw-flex-grow tw-min-w-0">
                    <div className="tw-truncate tw-max-w-full tw-font-semibold">Running {step.id}</div>
                    <div className="tw-truncate tw-max-w-full tw-text-xs tw-opacity-80">
                        {step.content}
                    </div>
                </div>
            </div>
        </div>
    )
}
