import type { ContextItem } from '@sourcegraph/cody-shared'
import { MENTION_CLASS_NAME } from '@sourcegraph/prompt-editor'
import { clsx } from 'clsx'
import { DatabaseIcon } from 'lucide-react'
import { FileLink } from '../../../components/FileLink'
import styles from './ContextCell.module.css'

export const ContextList: React.FC<{
    contextItems?: ContextItem[]
    isForFirstMessage: boolean
    isAgenticChat: boolean
    model?: string
    headerIconClassName?: string
}> = ({ contextItems, isForFirstMessage, isAgenticChat, model, headerIconClassName }) => (
    <div className="tw-flex tw-flex-col tw-gap-2 tw-my-2 tw-border-t tw-border-t-muted tw-pt-4">
        <div className="tw-text-sm tw-font-medium tw-text-foreground tw-flex tw-items-center tw-gap-3">
            <DatabaseIcon size={16} strokeWidth={1.75} className={headerIconClassName} />
            Context used
        </div>
        <ul className="tw-list-none tw-flex tw-flex-col tw-gap-1">
            {contextItems?.map((item, i) => (
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
