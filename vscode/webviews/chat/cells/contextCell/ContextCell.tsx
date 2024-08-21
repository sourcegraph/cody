import type { ContextItem, Model } from '@sourcegraph/cody-shared'
import { pluralize } from '@sourcegraph/cody-shared'
import type { RankedContext } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { MENTION_CLASS_NAME } from '@sourcegraph/prompt-editor'
import { clsx } from 'clsx'
import isEqual from 'lodash/isEqual'
import { BrainIcon, MessagesSquareIcon } from 'lucide-react'
import { type FunctionComponent, memo, useCallback, useState } from 'react'
import { FileLink } from '../../../components/FileLink'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../../components/shadcn/ui/accordion'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/shadcn/ui/tooltip'
import { SourcegraphLogo } from '../../../icons/SourcegraphLogo'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'
import { useConfig } from '../../../utils/useConfig'
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
    model?: Model['id']
    isForFirstMessage: boolean
    className?: string
    defaultOpen?: boolean

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

        const usedContext: ContextItem[] = []
        const excludedAtContext: ContextItem[] = []
        if (contextItemsToDisplay) {
            for (const item of contextItemsToDisplay) {
                if (item.isTooLarge || item.isIgnored) {
                    excludedAtContext.push(item)
                } else {
                    usedContext.push(item)
                }
            }
        }

        const itemCount = usedContext.length
        const contextItemCountLabel = `${itemCount} ${!isForFirstMessage ? 'new ' : ''}${pluralize(
            'item',
            itemCount
        )}`

        function logContextOpening() {
            getVSCodeAPI().postMessage({
                command: 'event',
                eventName: 'CodyVSCodeExtension:chat:context:opened',
                properties: {
                    fileCount: new Set(usedContext.map(file => file.uri.toString())).size,
                    excludedAtContext: excludedAtContext.length,
                },
            })
        }

        const {
            config: { internalDebugContext },
        } = useConfig()

        return contextItemsToDisplay === undefined || contextItemsToDisplay.length !== 0 ? (
            <Accordion
                type="single"
                collapsible
                defaultValue={((__storybook__initialOpen || defaultOpen) && 'item-1') || undefined}
                asChild={true}
            >
                <AccordionItem value="item-1" asChild>
                    <Cell
                        header={
                            <AccordionTrigger
                                onClick={logContextOpening}
                                onKeyUp={logContextOpening}
                                title={contextItemCountLabel}
                                className="tw-flex tw-items-center tw-gap-4"
                            >
                                <SourcegraphLogo
                                    width={NON_HUMAN_CELL_AVATAR_SIZE}
                                    height={NON_HUMAN_CELL_AVATAR_SIZE}
                                />
                                <span className="tw-flex tw-items-baseline">
                                    Context
                                    <span className="tw-opacity-60 tw-text-sm tw-ml-2">
                                        &mdash; {contextItemCountLabel}
                                    </span>
                                </span>
                            </AccordionTrigger>
                        }
                        containerClassName={className}
                        contentClassName="tw-flex tw-flex-col tw-gap-4 tw-overflow-hidden tw-max-w-full"
                        data-testid="context"
                    >
                        {contextItems === undefined ? (
                            <LoadingDots />
                        ) : (
                            <>
                                <AccordionContent>
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
                                                      contextAlternatives[selectedAlternative].strategy
                                                  }: (${(selectedAlternative ?? -1) + 1} of ${
                                                      contextAlternatives.length
                                                  })`}
                                        </div>
                                    )}
                                    <ul className="tw-list-none tw-flex tw-flex-col tw-gap-2 tw-pt-2">
                                        {contextItemsToDisplay?.map((item, i) => (
                                            <li
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
                                                    className={clsx(
                                                        styles.contextItem,
                                                        MENTION_CLASS_NAME
                                                    )}
                                                    linkClassName={styles.contextItemLink}
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
                                        <li>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span
                                                        className={clsx(
                                                            styles.contextItem,
                                                            'tw-flex tw-items-center tw-gap-2'
                                                        )}
                                                    >
                                                        <BrainIcon size={14} className="tw-ml-1" />
                                                        <span>Public knowledge</span>
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent side="bottom">
                                                    <span>
                                                        Information and general reasoning capabilities
                                                        trained into the model{' '}
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
        ) : null
    },
    isEqual
)
