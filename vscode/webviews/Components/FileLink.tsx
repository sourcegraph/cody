import type React from 'react'

import { displayPath } from '@sourcegraph/cody-shared'
import type { FileLinkProps } from '@sourcegraph/cody-ui/src/chat/components/EnhancedContext'

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
    let pathToDisplay: string
    let pathWithRange: string
    let tooltip: string

    console.log('render file link, has title?', !!title, title)

    if (source === 'unified') {
        // This is a remote search result.
        const repoShortName = repoName?.slice(repoName.lastIndexOf('/') + 1)
        pathToDisplay = `${repoShortName} ${title}`
        pathWithRange = range ? `${pathToDisplay}:${range.start.line}-${range.end.line}` : pathToDisplay
        tooltip = `${repoName} @${revision}\nincluded via Search`
    } else {
        pathToDisplay = `@${displayPath(uri)}`
        pathWithRange = range?.end.line
            ? `${pathToDisplay}:${range?.start.line + 1}-${range?.end.line - 1}`
            : pathToDisplay
        tooltip = source ? `${pathWithRange} included via ${source}` : pathWithRange
    }

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
