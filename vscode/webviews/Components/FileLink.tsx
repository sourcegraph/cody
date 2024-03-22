import classNames from 'classnames'
import type React from 'react'

import { displayLineRange, displayPath, webviewOpenURIForContextItem } from '@sourcegraph/cody-shared'
import type { FileLinkProps } from '../chat/components/EnhancedContext'

import styles from './FileLink.module.css'

export const FileLink: React.FunctionComponent<FileLinkProps> = ({
    uri,
    range,
    source,
    repoName,
    title,
    revision,
    isTooLarge,
}) => {
    const icon = getIconByFileSource(source)
    if (source === 'unified') {
        // This is a remote search result.
        const repoShortName = repoName?.slice(repoName.lastIndexOf('/') + 1)
        const pathToDisplay = `${repoShortName} ${title}`
        const pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
        const tooltip = `${repoName} @${revision}\nincluded via search (remote)`
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

    const pathToDisplay = `${displayPath(uri)}`
    const pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
    const tooltip = source ? `${pathWithRange} included via ${source}` : pathWithRange
    const { href, target } = webviewOpenURIForContextItem({ uri, range })
    const warning = 'This file is excluded due to token limit reached'
    return (
        <span className="styles.item">
            {isTooLarge && <i className="codicon codicon-warning" />}
            <i className={`codicon codicon-${icon}`} />
            <a
                className={classNames(styles.linkButton, isTooLarge && styles.excluded)}
                title={isTooLarge ? warning : tooltip}
                href={href}
                target={target}
            >
                {pathWithRange}
            </a>
        </span>
    )
}

function getIconByFileSource(source?: string): string {
    switch (source) {
        case 'user':
            return 'mention'
        case 'uri':
            return 'link'
        default:
            return 'sparkle'
    }
}
