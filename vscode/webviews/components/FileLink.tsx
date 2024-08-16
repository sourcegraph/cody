import { clsx } from 'clsx'
import type React from 'react'

import {
    type ContextItemSource,
    type RangeData,
    displayLineRange,
    displayPath,
    webviewOpenURIForContextItem,
} from '@sourcegraph/cody-shared'

import type { URI } from 'vscode-uri'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import styles from './FileLink.module.css'

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
    uri: 'from URI', // todo(tim): what is this?
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
    function logFileLinkClicked() {
        getVSCodeAPI().postMessage({
            command: 'event',
            eventName: 'CodyVSCodeExtension:chat:context:fileLink:clicked',
            properties: { source },
        })
    }

    let tooltip: string
    let pathWithRange: string
    let href: string
    let target: string | undefined
    if (source === 'unified') {
        // Remote search result.
        const repoShortName = repoName?.slice(repoName.lastIndexOf('/') + 1)
        const pathToDisplay = `${repoShortName} ${title}`
        pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
        tooltip = `${repoName} @${revision}\nincluded via Enhanced Context (Remote Search)`
        // We can skip encoding when the uri path already contains '@'.
        href = uri.toString(uri.path.includes('@'))
        target = '_blank'
    } else {
        const pathToDisplay = `${displayPath(uri)}`
        pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
        const openURI = webviewOpenURIForContextItem({ uri, range })
        tooltip = isIgnored
            ? IGNORE_WARNING
            : isTooLarge
              ? `${LIMIT_WARNING}${isTooLargeReason ? `: ${isTooLargeReason}` : ''}`
              : pathWithRange
        href = openURI.href
        target = openURI.target
    }

    return (
        <div className={clsx('tw-inline-flex tw-items-center tw-max-w-full', className)}>
            {isIgnored ? (
                <i className="codicon codicon-warning" title={tooltip} />
            ) : isTooLarge ? (
                <i className="codicon codicon-warning" title={tooltip} />
            ) : null}
            <a
                className={linkClassName}
                title={tooltip}
                href={href}
                target={target}
                onClick={logFileLinkClicked}
            >
                <i
                    className={clsx('codicon', `codicon-${source === 'user' ? 'mention' : 'file'}`)}
                    title={
                        (source &&
                            hoverSourceLabels[source] &&
                            `Included ${hoverSourceLabels[source]}`) ||
                        undefined
                    }
                />
                <div
                    className={clsx(styles.path, (isTooLarge || isIgnored) && styles.excluded)}
                    data-source={source || 'unknown'}
                >
                    {pathWithRange}
                </div>
            </a>
        </div>
    )
}
