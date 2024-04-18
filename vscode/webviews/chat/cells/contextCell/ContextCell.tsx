import type { ContextItem } from '@sourcegraph/cody-shared'
import classNames from 'classnames'
import type React from 'react'
import { FileLink } from '../../../Components/FileLink'
import { SourcegraphLogo } from '../../../icons/SourcegraphLogo'
import { MENTION_CLASS_NAME } from '../../../promptEditor/nodes/ContextItemMentionNode'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'
import { LoadingDots } from '../../components/LoadingDots'
import { Cell } from '../Cell'
import styles from './ContextCell.module.css'

/**
 * A component displaying the context for a human message.
 */
export const ContextCell: React.FunctionComponent<{
    contextFiles: ContextItem[] | undefined
    disabled?: boolean
    className?: string

    /** For use in storybooks only. */
    __storybook__initialOpen?: boolean
}> = ({ contextFiles, disabled, className, __storybook__initialOpen }) => {
    const usedContext = []
    const excludedAtContext = []
    if (contextFiles) {
        for (const f of contextFiles) {
            if (f.isTooLarge) {
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
        title = `${title} — ${excludedAtContext.length} ${excludedAtUnit} excluded`
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

    return contextFiles === undefined || contextFiles.length !== 0 ? (
        <Cell
            style="context"
            gutterIcon={<SourcegraphLogo width={20} height={20} />}
            disabled={disabled}
            containerClassName={className}
            data-testid="context"
        >
            {contextFiles === undefined ? (
                <LoadingDots />
            ) : (
                <details className={styles.details} open={__storybook__initialOpen}>
                    <summary
                        className={styles.summary}
                        onClick={logContextOpening}
                        onKeyUp={logContextOpening}
                        title={title}
                    >
                        <h4 className={styles.heading}>
                            Context <span className={styles.stats}>&mdash; {title}</span>
                        </h4>
                    </summary>
                    <ul className={styles.list}>
                        {contextFiles?.map((item, i) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                            <li key={i} className={styles.listItem}>
                                <FileLink
                                    uri={item.uri}
                                    repoName={item.repoName}
                                    revision={item.revision}
                                    source={item.source}
                                    range={item.range}
                                    title={item.title}
                                    isTooLarge={
                                        item.type === 'file' && item.isTooLarge && item.source === 'user'
                                    }
                                    className={classNames(styles.fileLink, MENTION_CLASS_NAME)}
                                />
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </Cell>
    ) : null
}
