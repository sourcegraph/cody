import classNames from 'classnames'
import type React from 'react'

import {
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
    source?: string
    range?: RangeData
    title?: string
    isTooLarge?: boolean
}

export const FileLink: React.FunctionComponent<FileLinkProps & { className?: string }> = ({
    uri,
    range,
    source,
    repoName,
    title,
    revision,
    isTooLarge,
    className,
}) => {
    function logFileLinkClicked() {
        getVSCodeAPI().postMessage({
            command: 'event',
            eventName: 'CodyVSCodeExtension:chat:context:fileLink:clicked',
            properties: { source },
        })
    }

    if (source === 'unified') {
        // This is a remote search result.
        const repoShortName = repoName?.slice(repoName.lastIndexOf('/') + 1)
        const pathToDisplay = `${repoShortName} ${title}`
        const pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
        const tooltip = `${repoName} @${revision}\nincluded via Enhanced Context (Enterprise Search)`
        return (
            <span className={classNames(styles.item, className)}>
                {/* biome-ignore lint/a11y/useValidAnchor: The onClick handler is only used for logging */}
                <a
                    href={uri.toString()}
                    target="_blank"
                    rel="noreferrer"
                    title={tooltip}
                    className={styles.linkButton}
                    onClick={logFileLinkClicked}
                >
                    <i className="codicon codicon-file" title={getFileSourceIconTitle(source)} />
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
        <span className={classNames(styles.linkContainer, className)}>
            {isTooLarge && <i className="codicon codicon-warning" title={warning} />}

            {/* biome-ignore lint/a11y/useValidAnchor: The onClick handler is only used for logging */}
            <a
                className={classNames(styles.linkButton, isTooLarge && styles.excluded)}
                title={isTooLarge ? warning : pathWithRange}
                href={href}
                target={target}
                onClick={logFileLinkClicked}
            >
                <i className="codicon codicon-file" title={getFileSourceIconTitle(source)} />
                {pathWithRange}
            </a>
        </span>
    )
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
