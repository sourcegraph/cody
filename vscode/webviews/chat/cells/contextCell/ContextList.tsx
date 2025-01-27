import type { ContextItem } from '@sourcegraph/cody-shared'
import { MENTION_CLASS_NAME } from '@sourcegraph/prompt-editor'
import { clsx } from 'clsx'
import { FileLink } from '../../../components/FileLink'
import styles from './ContextCell.module.css'

export const ContextList: React.FC<{
    contextItems?: ContextItem[]
    isForFirstMessage: boolean
    isAgenticChat: boolean
    model?: string
}> = ({ contextItems, isForFirstMessage, isAgenticChat, model }) => (
    <ul className="tw-list-none tw-flex tw-flex-col tw-gap-2">
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
        {/* Rest of the existing list items... */}
    </ul>
)
