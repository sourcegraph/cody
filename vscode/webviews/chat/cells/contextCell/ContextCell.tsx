import type { ContextItem, Model } from '@sourcegraph/cody-shared'
import { pluralize } from '@sourcegraph/cody-shared'
import { MENTION_CLASS_NAME } from '@sourcegraph/prompt-editor'
import { clsx } from 'clsx'
import isEqual from 'lodash/isEqual'
import { BrainIcon, MessagesSquareIcon } from 'lucide-react'
import { type FunctionComponent, memo } from 'react'
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
import { LoadingDots } from '../../components/LoadingDots'
import { Cell } from '../Cell'
import { NON_HUMAN_CELL_AVATAR_SIZE } from '../messageCell/assistant/AssistantMessageCell'
import styles from './ContextCell.module.css'

/**
 * A component displaying the context for a human message.
 */
export const ContextCell: FunctionComponent<{
    contextItems: ContextItem[] | undefined
    model?: Model['model']
    isForFirstMessage: boolean
    className?: string

    /** For use in storybooks only. */
    __storybook__initialOpen?: boolean
}> = memo(({ contextItems, model, isForFirstMessage, className, __storybook__initialOpen }) => {
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
            contentClassName="tw-flex tw-flex-col tw-gap-4 tw-overflow-hidden tw-max-w-full"
            data-testid="context"
        >
            {contextItems === undefined ? (
                <LoadingDots />
            ) : (
                <Accordion
                    type="single"
                    collapsible
                    className="tw-pt-1.5"
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
                                        <MessagesSquareIcon size={14} className="tw-ml-1" />
                                        <span>Prior messages and context in this conversation</span>
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
                                                Information and general reasoning capabilities trained
                                                into the model {model && <code>{model}</code>}
                                            </span>
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
}, isEqual)
