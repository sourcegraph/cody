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
import {
    ArrowRightIcon,
    DatabaseIcon,
    FileTextIcon,
    LibraryBigIcon,
    LinkIcon,
    PackageIcon,
    SmileIcon,
    SquareFunctionIcon,
} from 'lucide-react'
import type { FunctionComponent } from 'react'
import {
    IGNORED_FILE_WARNING_LABEL,
    LARGE_FILE_WARNING_LABEL,
} from '../../../src/chat/context/constants'
import RemoteFileProvider from '../../../src/context/openctx/remoteFileSearch'
import RemoteRepositorySearch from '../../../src/context/openctx/remoteRepositorySearch'
import WebProvider from '../../../src/context/openctx/web'
import GithubLogo from '../../icons/providers/github.svg?react'
import GoogleLogo from '../../icons/providers/google.svg?react'
import JiraLogo from '../../icons/providers/jira.svg?react'
import LinearLogo from '../../icons/providers/linear.svg?react'
import NotionLogo from '../../icons/providers/notion.svg?react'
import SentryLogo from '../../icons/providers/sentry.svg?react'
import SlackLogo from '../../icons/providers/slack.svg?react'
import SourcegraphLogo from '../../icons/providers/sourcegraph.svg?react'
import styles from './MentionMenuItem.module.css'

function getDescription(item: ContextItem, query: MentionQuery): string {
    const range = query.range ?? item.range
    const defaultDescription = `${displayPath(item.uri)}:${range ? displayLineRange(range) : ''}`

    switch (item.type) {
        case 'github_issue':
        case 'github_pull_request':
            return `${item.owner}/${item.repoName}`
        case 'file': {
            const dir = decodeURIComponent(displayPathDirname(item.uri))
            return `${range ? `Lines ${displayLineRange(range)} · ` : ''}${dir === '.' ? '' : dir}`
        }
        case 'openctx':
            return item.mention?.description || defaultDescription
        default:
            return defaultDescription
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
    const Icon = iconForProvider[provider.id] ?? DatabaseIcon
    return (
        <div className={styles.row} title={provider.id}>
            <Icon size={16} strokeWidth={1.75} />
            {provider.title ?? provider.id}
            <ArrowRightIcon size={16} strokeWidth={1.25} style={{ opacity: '0.5' }} />
        </div>
    )
}

const iconForProvider: Record<
    string,
    React.ComponentType<{
        size?: string | number
        strokeWidth?: string | number
    }>
> = {
    [FILE_CONTEXT_MENTION_PROVIDER.id]: FileTextIcon,
    [SYMBOL_CONTEXT_MENTION_PROVIDER.id]: SquareFunctionIcon,
    'src-search': SourcegraphLogo,
    [URL_CONTEXT_MENTION_PROVIDER.id]: LinkIcon,
    [PACKAGE_CONTEXT_MENTION_PROVIDER.id]: PackageIcon,
    [GITHUB_CONTEXT_MENTION_PROVIDER.id]: GithubLogo,
    // todo(tim): OpenCtx providers should be able to specify an icon string, so
    // we don't have to hardcode these URLs and other people can have their own
    // GitHub provider etc.
    'https://openctx.org/npm/@openctx/provider-github': GithubLogo,
    'https://openctx.org/npm/@openctx/provider-jira': JiraLogo,
    'https://openctx.org/npm/@openctx/provider-slack': SlackLogo,
    'https://openctx.org/npm/@openctx/provider-linear': LinearLogo,
    'https://openctx.org/npm/@openctx/provider-web': LinkIcon,
    'https://openctx.org/npm/@openctx/provider-google-docs': GoogleLogo,
    'https://openctx.org/npm/@openctx/provider-sentry': SentryLogo,
    'https://openctx.org/npm/@openctx/provider-notion': NotionLogo,
    'https://openctx.org/npm/@openctx/provider-hello-world': SmileIcon,
    'https://openctx.org/npm/@openctx/provider-devdocs': LibraryBigIcon,
    'https://openctx.org/npm/@openctx/provider-sourcegraph-search': SourcegraphLogo,
    [RemoteRepositorySearch.providerUri]: SourcegraphLogo,
    [RemoteFileProvider.providerUri]: SourcegraphLogo,
    [WebProvider.providerUri]: LinkIcon,
}
