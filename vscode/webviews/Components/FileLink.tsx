import classNames from 'classnames'
import type React from 'react'

import { displayLineRange, displayPath, webviewOpenURIForContextItem } from '@sourcegraph/cody-shared'
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
    isTooLarge,
}) => {
    function logFileLinkClicked() {
        getVSCodeAPI().postMessage({
            command: 'event',
            eventName: 'CodyVSCodeExtension:chat:context:fileLink:clicked',
            properties: { source },
        })
    }

    const icon = getIconByFileSource(source)
    if (source === 'unified') {
        // This is a remote search result.
        const repoShortName = repoName?.slice(repoName.lastIndexOf('/') + 1)
        const pathToDisplay = `${repoShortName} ${title}`
        const pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
        const tooltip = `${repoName} @${revision}\nincluded via Enhanced Context (Enterprise Search)`
        return (
            <span className="styles.item">
                <i className={`codicon codicon-${icon}`} title={getFileSourceIconTitle(source)} />
                {/* biome-ignore lint/a11y/useValidAnchor: The onClick handler is only used for logging */}
                <a
                    href={uri.toString()}
                    target="_blank"
                    rel="noreferrer"
                    title={tooltip}
                    className={styles.linkButton}
                    onClick={logFileLinkClicked}
                >
                    {pathWithRange}
                </a>
            </span>
        )
    }

    const pathToDisplay = `${displayPath(uri)}`
    const pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
    const { href, target } = webviewOpenURIForContextItem({ uri, range })
    const warning = 'Excluded due to context window limit'
    return (
        <span className={styles.linkContainer}>
            {isTooLarge && <i className="codicon codicon-warning" title={warning} />}
            <i className={`codicon codicon-${icon}`} title={getFileSourceIconTitle(source)} />
            {/* biome-ignore lint/a11y/useValidAnchor: The onClick handler is only used for logging */}
            <a
                className={classNames(styles.linkButton, isTooLarge && styles.excluded)}
                title={isTooLarge ? warning : pathWithRange}
                href={href}
                target={target}
                onClick={logFileLinkClicked}
            >
                {pathWithRange}
            </a>
        </span>
    )
}

function getIconByFileSource(source?: string): string {
    switch (source) {
        case 'uri':
        case 'user':
            return 'mention'
        default:
            return 'sparkle'
    }
}

function getFileSourceIconTitle(source?: string): string {
    const displayText = getFileSourceDisplayText(source)
    return `Included via ${displayText}`
}

function getFileSourceDisplayText(source?: string): string {
    switch (source) {
        case 'unified':
            return 'Enhanced Context (Enterprise Search)'
        case 'search':
        case 'symf':
            return 'Enhanced Context (Search)'
        case 'embeddings':
            return 'Enhanced Context (Embeddings)'
        case 'editor':
            return 'Editor Context'
        case 'selection':
            return 'Selection'
        case 'user':
            return '@-mention'
        default:
            return source ?? 'Enhanced Context'
    }
}
