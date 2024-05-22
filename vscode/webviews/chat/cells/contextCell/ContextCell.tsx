import type { ContextItem } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import type React from 'react'
import {
    EnhancedContextSettingsComponent,
    useEnhancedContextContext,
} from '../../../components/EnhancedContextSettings'
import { FileLink } from '../../../components/FileLink'
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
    className?: string

    isLastHumanMessage: boolean
    isDotComUser: boolean

    /** For use in storybooks only. */
    __storybook__initialOpen?: boolean
}> = ({ contextFiles, className, isLastHumanMessage, isDotComUser, __storybook__initialOpen }) => {
    const usedContext = []
    const excludedAtContext = []
    if (contextFiles) {
        for (const f of contextFiles) {
            if (f.isTooLarge || f.isIgnored) {
                excludedAtContext.push(f)
            } else {
                usedContext.push(f)
            }
        }
    }

    const fileCount = usedContext.length ? new Set(usedContext.map(file => file.uri.toString())).size : 0
    const excludedCount = excludedAtContext.length

    const enhancedContextProviders = useEnhancedContextContext()?.groups?.[0]?.providers
    const isEnhancedContextReady = enhancedContextProviders?.some(p => p.state === 'ready') ?? false

    let fileCountLabel = 'None'
    if (fileCount) {
        fileCountLabel = `${fileCount} file${fileCount > 1 ? 's' : ''}${
            excludedCount
                ? ` — ${excludedCount} ${excludedCount === 1 ? 'mention' : 'mentions'} excluded`
                : ''
        }`
    } else if (!isEnhancedContextReady) {
        fileCountLabel = !(isDotComUser && enhancedContextProviders?.length)
            ? '⚠ Repository Not Found'
            : '⚠ Automatic Code Context Unavailable'
    }
    // The info message to display when no context is used.
    const enhancedContextStatusInfo =
        // Only show the enhanced context status message on the last human message,
        // as history messages may not have the same reason for not having context.
        !isLastHumanMessage || isEnhancedContextReady
            ? 'No automatic code context was included. Try @mentioning to include specific context.'
            : // On last human message, show the reason why the context was not included.
              enhancedContextProviders?.length
              ? '⚠ The automatic code context is not ready...'
              : // When no providers are available, Display instructions to enable the feature.
                `⚠ Your local repository could not be automatically matched to one on your Sourcegraph instance. ${
                    isDotComUser
                        ? 'Follow the instructions below to enable codebase context.'
                        : 'Add the repository below to enable codebase context.'
                }`

    function logContextOpening() {
        getVSCodeAPI().postMessage({
            command: 'event',
            eventName: 'CodyVSCodeExtension:chat:context:opened',
            properties: {
                fileCount,
                excludedAtContext: excludedAtContext.length,
            },
        })
    }

    return (
        <Cell
            style="context"
            gutterIcon={<SourcegraphLogo width={20} height={20} />}
            containerClassName={className}
            data-testid="context"
        >
            {contextFiles === undefined && isLastHumanMessage ? (
                <LoadingDots />
            ) : (
                <details className={styles.details} open={__storybook__initialOpen}>
                    <summary
                        className={styles.summary}
                        onClick={logContextOpening}
                        onKeyUp={logContextOpening}
                        title={fileCountLabel}
                    >
                        <h4 className={styles.heading}>
                            Context <span className={styles.stats}>&mdash; {fileCountLabel}</span>
                        </h4>
                    </summary>
                    {contextFiles?.length ? (
                        <ul className={styles.list}>
                            {contextFiles.map((item, i) => (
                                // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                                <li key={i} className={styles.listItem}>
                                    <FileLink
                                        uri={item.uri}
                                        repoName={item.repoName}
                                        revision={item.revision}
                                        source={item.source}
                                        range={item.range}
                                        title={item.title}
                                        isTooLarge={item.source === 'user' && item.isTooLarge}
                                        isIgnored={item.source === 'user' && item.isIgnored}
                                        className={clsx(styles.fileLink, MENTION_CLASS_NAME)}
                                    />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className={styles.listItem}>
                            <div className={styles.info}>{enhancedContextStatusInfo}</div>
                            {isLastHumanMessage && !isEnhancedContextReady && (
                                <div className={styles.settingsContainer}>
                                    <EnhancedContextSettingsComponent
                                        presentationMode={isDotComUser ? 'consumer' : 'enterprise'}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </details>
            )}
        </Cell>
    )
}
