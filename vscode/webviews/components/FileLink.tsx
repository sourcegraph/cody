import { clsx } from 'clsx'
import type React from 'react'

import {
    type ContextItemSource,
    type RangeData,
    displayLineRange,
    displayPath,
    webviewOpenURIForContextItem,
} from '@sourcegraph/cody-shared'

import { useMemo } from 'react'
import type { URI } from 'vscode-uri'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import styles from './FileLink.module.css'
import { Button } from './shadcn/ui/button'

interface FileLinkProps {
    uri: URI
    repoName?: string
    revision?: string
    source?: ContextItemSource
    range?: RangeData
    title?: string
    isTooLarge?: boolean
    isTooLargeReason?: string
    isIgnored?: boolean
}

const LIMIT_WARNING = 'Excluded due to context window limit'
const IGNORE_WARNING = 'File ignored by an admin setting'

// todo(tim): All OpenCtx context source items have source === undefined,
// instead of 'user' or something more useful (like the provider icon and name)

const hoverSourceLabels: Record<ContextItemSource, string | undefined> = {
    // Shown in the format `Included ${label}`
    unified: 'via remote repository search',
    search: 'via local repository index (symf)',
    embeddings: 'via local repository index (embeddings)',
    editor: 'from workspace files',
    selection: 'from selected code',
    user: 'via @-mention',
    terminal: 'from terminal output',
    history: 'from git history',
    initial: 'from open repo or file',
}

export const FileLink: React.FunctionComponent<
    FileLinkProps & { className?: string; linkClassName?: string }
> = ({
    uri,
    range,
    source,
    repoName,
    title,
    revision,
    isTooLarge,
    isTooLargeReason,
    isIgnored,
    className,
    linkClassName,
}) => {
    const linkDetails = useMemo(() => {
        // Remote search result.
        if (source === 'unified') {
            const repoShortName = repoName?.slice(repoName.lastIndexOf('/') + 1)
            const pathToDisplay = `${title}`
            const tooltip = `${repoName}${
                revision ? `@${revision}` : ''
            }\nincluded from Sourcegraph search`
            return {
                pathWithRange: range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay,
                path: pathToDisplay,
                range: range ? `${displayLineRange(range)}` : undefined,
                repoShortName,
                tooltip,
                // We can skip encoding when the uri path already contains '@'.
                href: uri.toString(uri.path.includes('@')),
                target: '_blank' as const,
            }
        }

        const pathToDisplay = displayPath(uri)
        const pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
        const openURI = webviewOpenURIForContextItem({ uri, range })
        const tooltip = isIgnored
            ? IGNORE_WARNING
            : isTooLarge
              ? `${LIMIT_WARNING}${isTooLargeReason ? `: ${isTooLargeReason}` : ''}`
              : pathWithRange
        return {
            path: pathToDisplay,
            range: range ? `${displayLineRange(range)}` : undefined,
            tooltip,
            href: openURI.href,
            target: openURI.target,
        }
    }, [uri, range, source, repoName, title, revision, isIgnored, isTooLarge, isTooLargeReason])

    const onFileLinkClicked = () => {
        getVSCodeAPI().postMessage({ command: 'openFileLink', uri, range, source })
    }

    const iconTitle =
        source && hoverSourceLabels[source] ? `Included ${hoverSourceLabels[source]}` : undefined

    return (
        <div className={clsx('tw-inline-flex tw-items-center tw-max-w-full', className)}>
            {(isIgnored || isTooLarge) && (
                <i className="codicon codicon-warning" title={linkDetails.tooltip} />
            )}
            {source === 'unified' || uri.scheme === 'http' || uri.scheme === 'https' ? (
                <a
                    className={`${linkClassName} tw-truncate hover:tw-no-underline !tw-p-0`}
                    title={linkDetails.tooltip}
                    href={linkDetails.href}
                    target={linkDetails.target}
                >
                    <i className="codicon codicon-file" title={iconTitle} />
                    <div
                        className={clsx(styles.path, (isTooLarge || isIgnored) && styles.excluded)}
                        data-source={source || 'unknown'}
                    >
                        <PrettyPrintedContextItem
                            path={linkDetails.path}
                            range={linkDetails.range}
                            repoShortName={linkDetails.repoShortName}
                        />
                    </div>
                </a>
            ) : (
                <Button
                    className={`${linkClassName} tw-truncate hover:tw-no-underline !tw-p-0`}
                    title={linkDetails.tooltip}
                    variant="link"
                    onClick={onFileLinkClicked}
                >
                    <i
                        className={clsx('codicon', `codicon-${source === 'user' ? 'mention' : 'file'}`)}
                        title={iconTitle}
                    />
                    <div
                        className={clsx(styles.path, (isTooLarge || isIgnored) && styles.excluded)}
                        data-source={source || 'unknown'}
                    >
                        <PrettyPrintedContextItem
                            path={linkDetails.path}
                            range={linkDetails.range}
                            repoShortName={linkDetails.repoShortName}
                        />
                    </div>
                </Button>
            )}
        </div>
    )
}

export const PrettyPrintedContextItem: React.FunctionComponent<{
    path: string
    range?: string
    repoShortName?: string
}> = ({ path, range, repoShortName }) => {
    let sep = '/'
    if (!path.includes('/')) {
        sep = '\\'
    }

    const basename = path.split(sep).pop()
    const dirname = path.split(sep).slice(0, -1).join(sep)
    return (
        <>
            <span>{basename}</span>
            <span className={styles.range}>{range ? `:${range}` : ''}</span>{' '}
            {repoShortName && (
                <span className={styles.repoShortName}>
                    {repoShortName}
                    {dirname.length === 0 || dirname.startsWith(sep) ? '' : sep}
                </span>
            )}
            <span className={styles.dirname}>{dirname}</span>
        </>
    )
}
