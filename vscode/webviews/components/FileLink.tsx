import { clsx } from 'clsx'
import type React from 'react'
import { useState } from 'react'

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
    isIgnored?: boolean
}

const LIMIT_WARNING = 'Excluded due to context window limit'
const IGNORE_WARNING = 'File ignored by an admin setting'

const hoverSourceLabels: Record<ContextItemSource, string | undefined> = {
    unified: 'via remote repository search',
    search: 'via local repository index (symf)',
    embeddings: 'via local repository index (embeddings)',
    editor: 'from workspace files',
    selection: 'from selected code',
    user: 'via @-mention',
    terminal: 'from terminal output',
    uri: 'from URI',
    history: 'from git history',
    initial: 'from open repo or file',
}

interface FileContentDisplayProps {
    fileName: string;
    fileContents: string;
}

const FileContentDisplay: React.FC<FileContentDisplayProps> = ({ fileName, fileContents }) => {
    console.log("This is the file contents", fileContents)

    return (
        <div className={styles.fileContentDisplay}>
            <div className={styles.fileContentsContainer}>
                <pre className={styles.fileContents}>{fileContents}</pre>
            </div>
        </div>
    );
};

export default FileContentDisplay;

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
    isIgnored,
    className,
    linkClassName,
}) => {
    const [fileContents, setFileContents] = useState<string | null>(null);
    const [isFileContentVisible, setIsFileContentVisible] = useState(false);
    function logFileLinkClicked() {
        getVSCodeAPI().postMessage({
            command: 'event',
            eventName: 'CodyVSCodeExtension:chat:context:fileLink:clicked',
            properties: { source },
        })
    }

    function toggleFileContent() {
        console.log("This is the toggleFileContent function")
        if (!isFileContentVisible) {
            const vscode = getVSCodeAPI();
            vscode.postMessage({
                command: 'readLocalFileWithRange',
                uri,
                range,
            });
    
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'fileContent' && message.result.uri === uri.toString()) {
                    setFileContents(message.result.text);
                    setIsFileContentVisible(true);
                }
                
                console.log("This is the after of filecontents", fileContents, " with the message", message)
            }, { once: true });
        } else {
            setIsFileContentVisible(false);
        }
        console.log("This is the isFileContentVisible", isFileContentVisible, "This is of the cars fileContents", fileContents)
    }

    let tooltip: string
    let pathWithRange: string
    let href: string
    let target: string | undefined
    if (source === 'unified') {
        const repoShortName = repoName?.slice(repoName.lastIndexOf('/') + 1)
        const pathToDisplay = `${repoShortName} ${title}`
        pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
        tooltip = `${repoName} @${revision}\nincluded via Enhanced Context (Remote Search)`
        href = uri.toString(uri.path.includes('@'))
        target = '_blank'
    } else {
        const pathToDisplay = `${displayPath(uri)}`
        pathWithRange = range ? `${pathToDisplay}:${displayLineRange(range)}` : pathToDisplay
        const openURI = webviewOpenURIForContextItem({ uri, range })
        tooltip = isIgnored ? IGNORE_WARNING : isTooLarge ? LIMIT_WARNING : pathWithRange
        href = openURI.href
        target = openURI.target
    }

    return (
        <div className={clsx('tw-flex tw-flex-col tw-items-start tw-max-w-full tw-text-green-500 tw-bg-green-100', className)}>
            <div className={clsx('tw-flex tw-items-center tw-w-full')}>
                {isIgnored ? (
                    <i className="codicon codicon-warning" title={IGNORE_WARNING} />
                ) : isTooLarge ? (
                    <i className="codicon codicon-warning" title={LIMIT_WARNING} />
                ) : null}
                <a
                    className={clsx(linkClassName, styles.path)}
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
                        className={clsx(styles.path,  (isTooLarge || isIgnored) && styles.excluded)}
                        data-source={source || 'unknown'}
                    >
                        {pathWithRange}
                    </div>
                </a>
                <div onClick={toggleFileContent} className={styles.toggleIcon}>
                    {isFileContentVisible ? '▼' : '▶'}
                </div>
            </div>
            {isFileContentVisible && fileContents && (
                <div className={styles.fileContentBox}>
                    <FileContentDisplay
                        fileName={'Unknown file'}
                        fileContents={fileContents}
                    />
                </div>
            )}
        </div>
    )
}