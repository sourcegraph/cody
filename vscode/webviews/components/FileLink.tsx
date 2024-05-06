import { clsx } from 'clsx'
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

const WARNING = 'Excluded due to context window limit'

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
        tooltip = isTooLarge ? WARNING : pathWithRange
        href = openURI.href
        target = openURI.target
    }

    return (
        <div className={clsx(styles.linkContainer, className)}>
            {isTooLarge && <i className="codicon codicon-warning" title={WARNING} />}
            <a
                className={styles.linkButton}
                title={tooltip}
                href={href}
                target={target}
                onClick={logFileLinkClicked}
            >
                <i
                    className={clsx('codicon', `codicon-${source === 'user' ? 'mention' : 'file'}`)}
                    title={getFileSourceIconTitle(source)}
                />
                <div className={clsx(styles.path, isTooLarge && styles.excluded)}>{pathWithRange}</div>
            </a>
        </div>
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
