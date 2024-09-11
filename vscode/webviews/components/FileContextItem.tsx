import type { ContextItem } from '@sourcegraph/cody-shared'
import { MENTION_CLASS_NAME } from '@sourcegraph/prompt-editor'
import { clsx } from 'clsx'
import type { FC } from 'react'

import { FileLink } from './FileLink'
import { FileSnippet } from './FileSnippet'

import styles from './FileContextItem.module.css'

interface FileContextItemProps {
    item: ContextItem
    showSnippets: boolean
}

export const FileContextItem: FC<FileContextItemProps> = ({ item, showSnippets }) => {
    // Fallback on link for any non file context items (like openctx items)
    if (item.type !== 'file' || !showSnippets) {
        return (
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
        )
    }

    return <FileSnippet item={item} className={styles.codeBlock} />
}
