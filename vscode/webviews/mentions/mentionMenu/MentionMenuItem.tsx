import {
    ArchiveBoxIcon,
    ArrowRightIcon,
    CircleStackIcon,
    CodeBracketSquareIcon,
    DocumentIcon,
    LinkIcon,
} from '@heroicons/react/16/solid'
import {
    type ContextItem,
    type ContextMentionProviderMetadata,
    FILE_CONTEXT_MENTION_PROVIDER,
    GITHUB_CONTEXT_MENTION_PROVIDER,
    type MentionQuery,
    PACKAGE_CONTEXT_MENTION_PROVIDER,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    URL_CONTEXT_MENTION_PROVIDER,
    displayLineRange,
    displayPath,
    displayPathBasename,
    displayPathDirname,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import type { FunctionComponent } from 'react'
import {
    IGNORED_FILE_WARNING_LABEL,
    LARGE_FILE_WARNING_LABEL,
} from '../../../src/chat/context/constants'
import { SourcegraphLogo } from '../../icons/SourcegraphLogo'
import styles from './MentionMenuItem.module.css'

function getDescription(item: ContextItem, query: MentionQuery): string {
    const range = query.range ?? item.range
    switch (item.type) {
        case 'github_issue':
        case 'github_pull_request':
            return `${item.owner}/${item.repoName}`
        case 'file': {
            const dir = decodeURIComponent(displayPathDirname(item.uri))
            return `${range ? `Lines ${displayLineRange(range)} · ` : ''}${dir === '.' ? '' : dir}`
        }
        default:
            return `${displayPath(item.uri)}:${range ? displayLineRange(range) : ''}`
    }
}

export const MentionMenuContextItemContent: FunctionComponent<{
    query: MentionQuery
    item: ContextItem
}> = ({ query, item }) => {
    const isFileType = item.type === 'file'
    const isSymbol = item.type === 'symbol'
    const icon = isSymbol ? (item.kind === 'class' ? 'symbol-structure' : 'symbol-method') : null
    const title = item.title ?? (isSymbol ? item.symbolName : displayPathBasename(item.uri))
    const description = getDescription(item, query)

    const isIgnored = isFileType && item.isIgnored
    const isLargeFile = isFileType && item.isTooLarge
    let warning: string
    if (isIgnored) {
        warning = IGNORED_FILE_WARNING_LABEL
    } else if (isLargeFile && !item.range && !query.maybeHasRangeSuffix) {
        warning = LARGE_FILE_WARNING_LABEL
    } else {
        warning = ''
    }

    return (
        <>
            <div className={styles.row}>
                {item.type === 'symbol' && icon && (
                    <i className={`codicon codicon-${icon}`} title={item.kind} />
                )}
                <span className={clsx(styles.title, warning && styles.titleWithWarning)}>{title}</span>
                {description && <span className={styles.description}>{description}</span>}
            </div>
            {warning && <span className={styles.warning}>{warning}</span>}
        </>
    )
}

export const MentionMenuProviderItemContent: FunctionComponent<{
    provider: ContextMentionProviderMetadata
}> = ({ provider }) => {
    const Icon = iconForProvider[provider.id] ?? CircleStackIcon
    return (
        <div className={styles.row}>
            <Icon width={16} height={16} />
            {provider.title ?? provider.id}
            <ArrowRightIcon width={16} height={16} style={{ opacity: '0.3' }} />
        </div>
    )
}

const iconForProvider: Record<
    string,
    React.ComponentType<{ width?: string | number; height?: string | number }>
> = {
    [FILE_CONTEXT_MENTION_PROVIDER.id]: DocumentIcon,
    [SYMBOL_CONTEXT_MENTION_PROVIDER.id]: CodeBracketSquareIcon,
    'src-search': SourcegraphLogo,
    [URL_CONTEXT_MENTION_PROVIDER.id]: LinkIcon,
    [PACKAGE_CONTEXT_MENTION_PROVIDER.id]: ArchiveBoxIcon,
    [GITHUB_CONTEXT_MENTION_PROVIDER.id]: () => <i className="codicon codicon-logo-github" />,
}
