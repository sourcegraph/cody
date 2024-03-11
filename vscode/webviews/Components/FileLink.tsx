import type React from 'react'

import { displayLineRange, displayPath } from '@sourcegraph/cody-shared'
import { type FileLinkProps, useIncludeScores } from '../chat/components/EnhancedContext'

import { getVSCodeAPI } from '../utils/VSCodeApi'

import type { ContextItemMetadata } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import styles from './FileLink.module.css'

export const FileLink: React.FunctionComponent<FileLinkProps> = ({
    uri,
    range,
    source,
    repoName,
    title,
    revision,
    metadata,
}) => {
    if (source === 'unified') {
        // This is a remote search result.
        const repoShortName = repoName?.slice(repoName.lastIndexOf('/') + 1)
        const pathToDisplay = `${repoShortName} ${title}`
        const pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
        const tooltip = `${repoName} @${revision}\nincluded via Search`
        return (
            <a
                href={uri.toString()}
                target="_blank"
                rel="noreferrer"
                title={tooltip}
                className={styles.linkButton}
            >
                {metadata && <MetadataElement metadata={metadata} />}
                {pathWithRange}
            </a>
        )
    }

    const pathToDisplay = `@${displayPath(uri)}`
    const pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
    const tooltip = source ? `${pathWithRange} included via ${source}` : pathWithRange
    return (
        <button
            className={styles.linkButton}
            type="button"
            title={tooltip}
            onClick={() => {
                getVSCodeAPI().postMessage({ command: 'openFile', uri, range })
            }}
        >
            {metadata && <MetadataElement metadata={metadata} />}
            {pathWithRange}
        </button>
    )
}

// Pretty-print the score, so that at most 2 sig figs are used, and if a number
// is greater than one million, 'M' is used, and if a number is between one
// thousand and one million, 'K' is used
function prettyPrintScore(score: number): string {
    if (score > 1000000) {
        return `${(score / 1_000_000).toFixed(1)}M`
    }
    if (score > 1000) {
        return `${(score / 1_000).toFixed(1)}K`
    }
    return score.toFixed(2)
}

const MetadataElement: React.FunctionComponent<{ metadata: ContextItemMetadata }> = ({ metadata }) => {
    const includeScores = useIncludeScores()
    if (!includeScores) {
        return null
    }
    return (
        <span title={metadata.expandedQuery && `query: ${metadata.expandedQuery}`}>
            {'{'}
            {metadata.blugeScore && <span>score: {prettyPrintScore(metadata.blugeScore)}</span>}
            {metadata.otherDisplayInfo && <span>, {metadata.otherDisplayInfo}</span>}
            {'} '}
        </span>
    )
}
