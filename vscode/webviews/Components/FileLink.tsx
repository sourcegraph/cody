import type React from 'react'

import { displayLineRange, displayPath } from '@sourcegraph/cody-shared'
import type { FileLinkProps } from '../chat/components/EnhancedContext'

import { getVSCodeAPI } from '../utils/VSCodeApi'

import styles from './FileLink.module.css'

export const FileLink: React.FunctionComponent<FileLinkProps> = ({
    uri,
    range,
    source,
    repoName,
    title,
    revision,
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
            {pathWithRange}
        </button>
    )
}
