import type { ContextItem } from '@sourcegraph/cody-shared'
import { VSCodeBadge } from '@vscode/webview-ui-toolkit/react'
import type React from 'react'
import { FileLink } from '../../../Components/FileLink'
import { SourcegraphLogo } from '../../../icons/SourcegraphLogo'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'
import { LoadingContext } from '../../BlinkingCursor'
import { Cell } from '../Cell'
import styles from './ContextCell.module.css'

/**
 * A component displaying the context for a human message.
 */
export const ContextCell: React.FunctionComponent<{
    contextFiles: ContextItem[] | undefined
    isLoading: boolean
    disabled?: boolean
    className?: string
}> = ({ contextFiles, isLoading, disabled, className }) => {
    const usedContext = []
    const excludedAtContext = []
    if (contextFiles) {
        for (const f of contextFiles) {
            if (f.type === 'file' && f.source === 'user' && f.isTooLarge) {
                excludedAtContext.push(f)
            } else {
                usedContext.push(f)
            }
        }
    }

    // It checks if file.range exists first before accessing start and end.
    // If range doesn't exist, it adds 0 lines for that file.
    const lineCount = usedContext.reduce(
        (total, file) =>
            total +
            (file.range
                ? // Don't count a line with no characters included (character == 0).
                  (file.range.end.character === 0 ? file.range.end.line - 1 : file.range.end.line) -
                  file.range.start?.line +
                  1
                : 0),
        0
    )
    const fileCount = new Set(usedContext.map(file => file.uri.toString())).size
    const lines = `${lineCount} line${lineCount > 1 ? 's' : ''}`
    const files = `${fileCount} file${fileCount > 1 ? 's' : ''}`
    let title = lineCount ? `${lines} from ${files}` : `${files}`
    if (excludedAtContext.length) {
        const excludedAtUnit = excludedAtContext.length === 1 ? 'mention' : 'mentions'
        title = `${title} - ⚠️ ${excludedAtContext.length} ${excludedAtUnit} excluded`
    }

    function logContextOpening() {
        getVSCodeAPI().postMessage({
            command: 'event',
            eventName: 'CodyVSCodeExtension:chat:context:opened',
            properties: {
                lineCount,
                fileCount,
                excludedAtContext: excludedAtContext.length,
            },
        })
    }

    return contextFiles && contextFiles.length > 0 ? (
        <Cell
            style="context"
            gutterIcon={<SourcegraphLogo width={20} height={20} />}
            disabled={disabled}
            containerClassName={className}
        >
            {isLoading ? (
                <LoadingContext />
            ) : (
                <details className={styles.details}>
                    <summary
                        className={styles.summary}
                        onClick={logContextOpening}
                        onKeyUp={logContextOpening}
                    >
                        <h4 className={styles.heading}>
                            Context <VSCodeBadge>{contextFiles.length}</VSCodeBadge>
                        </h4>
                    </summary>
                    <ul className={styles.list}>
                        {contextFiles?.map((file, i) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                            <li key={i} className={styles.listItem}>
                                <FileLink
                                    uri={file.uri}
                                    repoName={file.repoName}
                                    revision={file.revision}
                                    source={file.source}
                                    range={file.range}
                                    title={file.title}
                                    isTooLarge={
                                        file.type === 'file' && file.isTooLarge && file.source === 'user'
                                    }
                                    className={styles.fileLink}
                                />
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </Cell>
    ) : null
}
