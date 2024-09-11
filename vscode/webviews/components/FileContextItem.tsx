import type { ContextItem } from '@sourcegraph/cody-shared'
import { MENTION_CLASS_NAME } from '@sourcegraph/prompt-editor'
import { clsx } from 'clsx'
import { ChevronRight, ChevronUp } from 'lucide-react'
import { type FC, useState } from 'react'

import { FileLink } from './FileLink'
import { FileSnippet } from './FileSnippet'
import { Button } from './shadcn/ui/button'

import styles from './FileContextItem.module.css'

interface FileContextItemProps {
    item: ContextItem
}

export const FileContextItem: FC<FileContextItemProps> = props => {
    const { item } = props
    const [isOpen, setOpen] = useState(false)

    // Fallback on link for any non file context items (like openctx items)
    if (item.type !== 'file') {
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

    return (
        <div className={styles.root}>
            <header className={styles.header}>
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

                <Button variant="secondary" size="sm" onClick={() => setOpen(!isOpen)}>
                    {!isOpen ? (
                        <>
                            Show <ChevronRight size={14} />
                        </>
                    ) : (
                        <>
                            Hide <ChevronUp size={14} />
                        </>
                    )}
                </Button>
            </header>

            {isOpen && <FileSnippet item={item} className={styles.codeBlock} />}
        </div>
    )
}
