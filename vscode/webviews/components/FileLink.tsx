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
            const pathToDisplay = `${repoShortName} ${title}`
            return {
                pathWithRange: range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay,
                tooltip: `${repoName} ${
                    revision ? `@${revision}` : ''
                }\nincluded via Enhanced Context (Remote Search)`,
                // We can skip encoding when the uri path already contains '@'.
                href: uri.toString(uri.path.includes('@')),
                target: '_blank' as const,
            }
        }

        const pathToDisplay = displayPath(uri)
        const pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
        const openURI = webviewOpenURIForContextItem({ uri, range })
        return {
            pathWithRange,
            tooltip: isIgnored
                ? IGNORE_WARNING
                : isTooLarge
                  ? `${LIMIT_WARNING}${isTooLargeReason ? `: ${isTooLargeReason}` : ''}`
                  : pathWithRange,
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
            {source === 'unified' ? (
                <a
                    className={linkClassName}
                    title={linkDetails.tooltip}
                    href={linkDetails.href}
                    target={linkDetails.target}
                >
                    <i className="codicon codicon-file" title={iconTitle} />
                    <div
                        className={clsx(styles.path, (isTooLarge || isIgnored) && styles.excluded)}
                        data-source={source || 'unknown'}
                    >
                        {linkDetails.pathWithRange}
                    </div>
                </a>
            ) : (
                <Button
                    variant="link"
                    onClick={onFileLinkClicked}
                    className="tw-truncate hover:tw-no-underline !tw-p-0"
                >
                    <i
                        className={clsx('codicon', `codicon-${source === 'user' ? 'mention' : 'file'}`)}
                        title={iconTitle}
                    />
                    <div
                        className={clsx(styles.path, (isTooLarge || isIgnored) && styles.excluded)}
                        data-source={source || 'unknown'}
                    >
                        {linkDetails.pathWithRange}
                    </div>
                </Button>
            )}
        </div>
    )
}
