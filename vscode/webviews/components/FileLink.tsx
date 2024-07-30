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
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';

import {
    Popover,
    PopoverTrigger,
    PopoverContent,
} from './shadcn/ui/popover'

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
    range: RangeData;
}

interface FileContentDisplayProps {
    fileName: string;
    filePath: string;
    fileContents: string;
    range: RangeData;
}

const FileContentDisplay: React.FC<FileContentDisplayProps> = ({ fileName, filePath, fileContents, range }) => {
    const startLine = range.start.line - 2 > 0 ? range.start.line - 2 : 0;
    const endLine = range.end.line + 2;
    const lines = fileContents.split('\n');
    const displayedLines = lines;

    console.log("Start line:", startLine);
    console.log("End line:", endLine);
    console.log("Displayed lines:", displayedLines);

    return (
        <div className={styles.fileContentDisplay}>
            <div className={styles.fileContentsContainer}>
                <div className={styles.fileHeader}>
                    <div className={styles.fileName}>{fileName}</div>
                    <div className={styles.filePath}>{filePath}</div>
                    <div className={styles.lineRange}>Lines {range.start.line} - {range.end.line}</div>
                </div>
                <SyntaxHighlighter
                    language="typescript"
                    style={dracula}
                    showLineNumbers
                    startingLineNumber={startLine + 1}
                >
                    {displayedLines.join('\n')}
                </SyntaxHighlighter>
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
    const [isPopoverVisible, setIsPopoverVisible] = useState(false);

    function fetchFileContent() {
        if (!isFileContentVisible) {
            const vscode = getVSCodeAPI();
            vscode.postMessage({
                command: 'readLocalFileWithRange',
                uri,
                range: range ? {
                    start: { line: range.start.line - 2, character: 0 },
                    end: { line: range.end.line + 2, character: 0 }
                } : undefined,
            });
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'fileContent' && message.result.uri === uri.toString()) {
                    setFileContents(message.result.text);
                    setIsFileContentVisible(true);
                }
                
            }, { once: true });
        } else {
            setIsFileContentVisible(false);
        }
    }

    let tooltip: string
    let pathWithRange: string
    let href: string
    let target: string | undefined
    let fileName: string

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
    function handleMouseEnter() {
        if (!isFileContentVisible) {
            fetchFileContent();
        }
        console.log("I have entered")
        setIsPopoverVisible(true);
    }

    function handleMouseLeave() {
        console.log("I have left")
        setIsPopoverVisible(false);
    }
    fileName = uri.path.split('/').pop() || 'Unknown file'
    const filePath = uri.path;
    console.log("Path with range:", pathWithRange)

    return (
        <div className={clsx('tw-flex tw-flex-col tw-items-start tw-max-w-full', className)} >
            <div className={clsx('tw-flex tw-items-center tw-w-full')}>
                {isIgnored ? (
                    <i className="codicon codicon-warning" title={IGNORE_WARNING} style={{ color: '#d4d4d4' }} />
                ) : isTooLarge ? (
                    <i className="codicon codicon-warning" title={LIMIT_WARNING} style={{ color: '#d4d4d4' }} />
                ) : null}
                     <a
                    className={clsx(linkClassName, styles.path)}
                    title={tooltip}
                    href={href}
                    target={target}
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
                    <Popover>
                        <PopoverTrigger asChild>
                            <div
                                className={clsx(styles.path, (isTooLarge || isIgnored) && styles.excluded)}
                                data-source={source || 'unknown'}
                                onMouseEnter={handleMouseEnter}
                                onMouseLeave={handleMouseLeave}
                            >
                                {fileName}
                            </div>
                        </PopoverTrigger>
                        {isPopoverVisible && (
                            <PopoverContent className={styles.popoverContent}>
                                {isFileContentVisible && fileContents && (
                                    <FileContentDisplay
                                        fileName={fileName}
                                        filePath={filePath}
                                        fileContents={fileContents}
                                        range={range as RangeData}
                                    />
                                )}
                            </PopoverContent>
                        )}
                    </Popover>
                </a>
            </div>
        </div>
    )
}