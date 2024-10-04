import type { ContextItem, Model } from '@sourcegraph/cody-shared'
import { pluralize } from '@sourcegraph/cody-shared'
import type { RankedContext } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { clsx } from 'clsx'
import { BrainIcon, MessagesSquareIcon } from 'lucide-react'
import { type FunctionComponent, memo, useCallback, useState } from 'react'
import { FileContextItem } from '../../../components/FileContextItem'
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
import { useExperimentalOneBox } from '../../../utils/useExperimentalOneBox'
import { CodyIcon } from '../../components/CodyIcon'
import { LoadingDots } from '../../components/LoadingDots'
import { Cell } from '../Cell'
import { NON_HUMAN_CELL_AVATAR_SIZE } from '../messageCell/assistant/AssistantMessageCell'
import styles from './ContextCell.module.css'

/**
 * A component displaying the context for a human message.
 */
export const ContextCell: FunctionComponent<{
    contextItems: ContextItem[] | undefined
    contextAlternatives?: RankedContext[]
    isContextLoading: boolean
    model?: Model['id']
    isForFirstMessage: boolean
    className?: string
    defaultOpen?: boolean
    showSnippets?: boolean
    reSubmitWithChatIntent?: () => void

    /** For use in storybooks only. */
    __storybook__initialOpen?: boolean
}> = memo(
    ({
        contextItems,
        contextAlternatives,
        model,
        isForFirstMessage,
        className,
        defaultOpen,
        __storybook__initialOpen,
        reSubmitWithChatIntent,
        showSnippets = false,
        isContextLoading,
    }) => {
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

        const logContextOpening = useCallback(() => {
            telemetryRecorder.recordEvent('cody.contextCell', 'opened', {
                metadata: {
                    fileCount: new Set(usedContext.map(file => file.uri.toString())).size,
                    excludedAtContext: excludedContext.length,
                },
            })
        }, [excludedContext.length, usedContext])

        const {
            config: { internalDebugContext },
        } = useConfig()

        const telemetryRecorder = useTelemetryRecorder()
        const oneboxEnabled = useExperimentalOneBox()
        const logValueChange = useCallback(
            (value: string | undefined) => {
                if (oneboxEnabled) {
                    telemetryRecorder.recordEvent('onebox.contextDrawer', 'clicked', {
                        [value ? 'expanded' : 'collapsed']: 1,
                    })
                }
            },
            [telemetryRecorder, oneboxEnabled]
        )

        const [showAllResults, setShowAllResults] = useState(false)

        return (
            <div>
                {(contextItemsToDisplay === undefined || contextItemsToDisplay.length !== 0) && (
                    <Accordion
                        type="single"
                        collapsible={!showSnippets}
                        defaultValue={
                            ((__storybook__initialOpen || defaultOpen) && 'item-1') || undefined
                        }
                        onValueChange={logValueChange}
                        asChild={true}
                    >
                        <AccordionItem value="item-1" asChild>
                            <Cell
                                header={
                                    <AccordionTrigger
                                        onClick={logContextOpening}
                                        onKeyUp={logContextOpening}
                                        title={itemCountLabel}
                                        className="tw-flex tw-items-center tw-gap-4"
                                        disabled={isContextLoading}
                                    >
                                        <SourcegraphLogo
                                            width={NON_HUMAN_CELL_AVATAR_SIZE}
                                            height={NON_HUMAN_CELL_AVATAR_SIZE}
                                        />
                                        <span className="tw-flex tw-items-baseline">
                                            Context
                                            <span className="tw-opacity-60 tw-text-sm tw-ml-2">
                                                &mdash;{' '}
                                                {isContextLoading
                                                    ? // TODO: Removes hardcoded model.
                                                      model?.includes('deep-cody')
                                                        ? 'Thinking...'
                                                        : 'Retrieving codebase files…'
                                                    : itemCountLabel}
                                            </span>
                                        </span>
                                    </AccordionTrigger>
                                }
                                containerClassName={className}
                                contentClassName="tw-flex tw-flex-col tw-gap-4 tw-max-w-full"
                                data-testid="context"
                            >
                                {contextItems === undefined ? (
                                    <LoadingDots />
                                ) : (
                                    <>
                                        <AccordionContent overflow={showSnippets}>
                                            {internalDebugContext && contextAlternatives && (
                                                <div>
                                                    <button
                                                        onClick={prevSelectedAlternative}
                                                        type="button"
                                                    >
                                                        &larr;
                                                    </button>
                                                    <button
                                                        onClick={nextSelectedAlternative}
                                                        type="button"
                                                    >
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
                                                {contextItemsToDisplay?.map((item, i) =>
                                                    !showSnippets || showAllResults || i < 5 ? (
                                                        <li
                                                            // biome-ignore lint/correctness/useJsxKeyInIterable:
                                                            // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                                                            key={i}
                                                            data-testid="context-item"
                                                        >
                                                            <FileContextItem
                                                                item={item}
                                                                showSnippets={showSnippets}
                                                            />
                                                            {internalDebugContext &&
                                                                item.metadata &&
                                                                item.metadata.length > 0 && (
                                                                    <span
                                                                        className={
                                                                            styles.contextItemMetadata
                                                                        }
                                                                    >
                                                                        {item.metadata.join(', ')}
                                                                    </span>
                                                                )}
                                                        </li>
                                                    ) : null
                                                )}
                                                {showSnippets &&
                                                !showAllResults &&
                                                contextItemsToDisplay &&
                                                contextItemsToDisplay.length > 5 ? (
                                                    <div className="tw-flex tw-justify-between">
                                                        <Button
                                                            variant="link"
                                                            onClick={() => setShowAllResults(true)}
                                                        >
                                                            Show {contextItemsToDisplay.length - 5} more
                                                            results
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="tw-text-prmary tw-flex tw-gap-2 tw-items-center"
                                                            onClick={reSubmitWithChatIntent}
                                                        >
                                                            <CodyIcon className="tw-text-link" />
                                                            Ask the LLM
                                                        </Button>
                                                    </div>
                                                ) : null}
                                                {!isForFirstMessage && (
                                                    <span
                                                        className={clsx(
                                                            styles.contextItem,
                                                            'tw-flex tw-items-center tw-gap-2'
                                                        )}
                                                    >
                                                        <MessagesSquareIcon
                                                            size={14}
                                                            className="tw-ml-1"
                                                        />
                                                        <span>
                                                            Prior messages and context in this
                                                            conversation
                                                        </span>
                                                    </span>
                                                )}
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
                                                                <span>Public knowledge</span>
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="bottom">
                                                            <span>
                                                                Information and general reasoning
                                                                capabilities trained into the model{' '}
                                                                {model && <code>{model}</code>}
                                                            </span>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </li>
                                            </ul>
                                        </AccordionContent>
                                    </>
                                )}
                            </Cell>
                        </AccordionItem>
                    </Accordion>
                )}
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
