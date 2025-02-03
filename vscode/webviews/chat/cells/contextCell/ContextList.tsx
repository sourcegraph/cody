import type { ContextItem } from '@sourcegraph/cody-shared'
import { MENTION_CLASS_NAME } from '@sourcegraph/prompt-editor'
import { clsx } from 'clsx'
import { CircleSlash, DatabaseIcon } from 'lucide-react'
import { FileLink } from '../../../components/FileLink'
import styles from './ContextCell.module.css'

export const ContextList: React.FC<{
    contextItems?: ContextItem[]
    isForFirstMessage: boolean
    isAgenticChat: boolean
    model?: string
    headerIconClassName?: string
    isSearchResponse?: boolean
}> = ({
    contextItems,
    isForFirstMessage,
    isAgenticChat,
    model,
    headerIconClassName,
    isSearchResponse,
}) => {
    const hasNoContext = !contextItems || contextItems.length === 0

    if (!isAgenticChat && hasNoContext && isSearchResponse) {
        return null
    }

    if (isAgenticChat) {
        if (hasNoContext) {
            return (
                <div className="tw-flex tw-flex-col tw-gap-2 tw-my-2 tw-border-t tw-border-t-muted tw-pt-4">
                    <div className="tw-text-sm tw-text-muted-foreground tw-flex tw-gap-3 tw-flex-col">
                        <div className="tw-flex tw-gap-4">
                            <CircleSlash
                                size={14}
                                strokeWidth={1.75}
                                className={clsx(headerIconClassName, 'tw-mt-0.5')}
                            />
                            <div className="tw-flex tw-flex-col">
                                No additional context used
                                <div className="tw-text-sm tw-font-normal">
                                    Using public knowledge only
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )
        }
        return (
            <div className="tw-flex tw-flex-col tw-gap-2 tw-my-2 tw-border-t tw-border-t-muted tw-pt-4">
                <div className="tw-text-sm tw-font-medium tw-text-foreground tw-flex tw-items-center tw-gap-3">
                    <DatabaseIcon size={14} strokeWidth={1.75} className="tw-text-muted-foreground" />
                    Context used
                </div>
                <ul className="tw-list-none tw-flex tw-flex-col tw-gap-1">
                    {contextItems?.map((item, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                        <li key={i} data-testid="context-item">
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
                                className={clsx(styles.linkContainer, MENTION_CLASS_NAME)}
                            />
                        </li>
                    ))}
                </ul>
            </div>
        )
    }

    if (hasNoContext) {
        return null
    }

    return (
        <div className="tw-flex tw-flex-col tw-gap-2 tw-my-2 tw-border-t tw-border-t-muted tw-pt-4">
            <div className="tw-text-sm tw-font-medium tw-text-foreground tw-flex tw-items-center tw-gap-3">
                <DatabaseIcon size={14} strokeWidth={1.75} className="tw-text-muted-foreground" />
                Context used
            </div>
            <ul className="tw-list-none tw-flex tw-flex-col tw-gap-1">
                {contextItems?.map((item, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                    <li key={i} data-testid="context-item">
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
                            className={clsx(styles.linkContainer, MENTION_CLASS_NAME)}
                        />
                    </li>
                ))}
            </ul>
        </div>
    )
}
