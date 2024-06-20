import type { ContextItem, Model } from '@sourcegraph/cody-shared'
import { pluralize } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { BrainIcon, MessagesSquareIcon } from 'lucide-react'
import type React from 'react'
import { FileLink } from '../../../components/FileLink'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../../components/shadcn/ui/accordion'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/shadcn/ui/tooltip'
import { SourcegraphLogo } from '../../../icons/SourcegraphLogo'
import { MENTION_CLASS_NAME } from '../../../promptEditor/nodes/ContextItemMentionNode'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'
import { LoadingDots } from '../../components/LoadingDots'
import { Cell } from '../Cell'
import { NON_HUMAN_CELL_AVATAR_SIZE } from '../messageCell/assistant/AssistantMessageCell'
import styles from './ContextCell.module.css'


/**
 * A component displaying the context for a human message.
 */
export const ContextCell: React.FunctionComponent<{
    contextItems: ContextItem[] | undefined
    model?: Model['model']
    isForFirstMessage: boolean
    className?: string

    /** For use in storybooks only. */
    __storybook__initialOpen?: boolean
}> = ({ contextItems, model, isForFirstMessage, className, __storybook__initialOpen }) => {
    const usedContext: ContextItem[] = []
    const excludedAtContext: ContextItem[] = []
    if (contextItems) {
        for (const item of contextItems) {
            if (item.isTooLarge || item.isIgnored) {
                excludedAtContext.push(item)
            } else {
                usedContext.push(item)
            }
        }
    }

    const itemCount = usedContext.length
    let contextItemCountLabel = `${itemCount} ${!isForFirstMessage ? 'new ' : ''}${pluralize(
        'item',
        itemCount
    )}`
    if (excludedAtContext.length) {
        const excludedAtUnit = excludedAtContext.length === 1 ? 'mention' : 'mentions'
        contextItemCountLabel = `${contextItemCountLabel}, ${excludedAtContext.length} ${excludedAtUnit} excluded`
    }

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

    return contextItems === undefined || contextItems.length !== 0 ? (
        <Cell
            style="context"
            gutterIcon={
                <SourcegraphLogo
                    width={NON_HUMAN_CELL_AVATAR_SIZE}
                    height={NON_HUMAN_CELL_AVATAR_SIZE}
                />
            }
            containerClassName={className}
            contentClassName="tw-flex tw-flex-col tw-gap-4"
            data-testid="context"
        >
            {contextItems === undefined ? (
                <LoadingDots />
            ) : (
                <Accordion
                    type="single"
                    collapsible
                    className="tw-pt-1"
                    defaultValue={(__storybook__initialOpen && 'item-1') || undefined}
                >
                    <AccordionItem value="item-1">
                        <AccordionTrigger
                            onClick={logContextOpening}
                            onKeyUp={logContextOpening}
                            title={contextItemCountLabel}
                        >
                            <span className="tw-flex tw-items-baseline">
                                <span className="tw-font-medium">Context </span>
                                <span className="tw-opacity-60 tw-text-sm tw-ml-2">
                                    &mdash; {contextItemCountLabel}
                                </span>
                            </span>
                        </AccordionTrigger>
                        <AccordionContent>
                            <ul className="tw-list-none tw-flex tw-flex-col tw-gap-2 tw-pt-2">
                                {contextItems?.map((item, i) => (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                                    <li key={i} data-testid="context-item" className="tw-max-w-full">
                                        <FileLink
                                            uri={item.uri}
                                            repoName={item.repoName}
                                            revision={item.revision}
                                            source={item.source}
                                            range={item.range}
                                            title={item.title}
                                            isTooLarge={item.isTooLarge}
                                            isIgnored={item.isIgnored}
                                            className={clsx(styles.contextItem, MENTION_CLASS_NAME)}
                                            linkClassName={styles.contextItemLink}
                                        />
                                    </li>
                                ))}
                                {!isForFirstMessage && (
                                    <span
                                        className={clsx(
                                            styles.contextItem,
                                            'tw-flex tw-items-center tw-gap-2'
                                        )}
                                    >
                                        <MessagesSquareIcon size={12} className="tw-ml-1" /> Prior
                                        messages and context in this conversation
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
                                                <BrainIcon size={12} className="tw-ml-1" /> Public
                                                knowledge{' '}
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            Information and general reasoning capabilities trained into
                                            the model {model && <code>{model}</code>}
                                        </TooltipContent>
                                    </Tooltip>
                                </li>
                            </ul>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            )}
        </Cell>
    ) : null
}
