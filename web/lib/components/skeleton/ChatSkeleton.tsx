import type { FC } from 'react'

import classNames from 'classnames'
import styles from './ChatSkeleton.module.css'

interface ChatSkeletonProps {
    className?: string
}

/**
 * Skeleton UI for Cody Web Chat UI (loading mock UI state), currently is used only
 * for Cody Web UI since it takes noticeable time to load and initialize.
 */
export const ChatSkeleton: FC<ChatSkeletonProps> = props => {
    const { className } = props
    return (
        <div className={classNames(className, styles.root)}>
            <header className={styles.header}>
                <div className={classNames(styles.line, styles.lineSmall)} />
                <div className={classNames(styles.line, styles.lineSmall)} />
                <div className={classNames(styles.line, styles.lineSmall)} />
            </header>

            <div className={styles.chat}>
                <header className={styles.header}>
                    <div className={classNames(styles.line, styles.lineCircle)} />
                    <div className={styles.line} />
                </header>

                <div className={styles.chatInput}>
                    <div className={styles.chatMentionsRow}>
                        <div className={classNames(styles.line)} />
                        <div className={classNames(styles.line)} />
                    </div>

                    <div className={styles.chatMentionsRow}>
                        <div className={classNames(styles.line, styles.lineSmall)} />
                        <div className={classNames(styles.line, styles.lineSmall)} />
                        <div className={classNames(styles.line, styles.lineSmall)} />

                        <div
                            className={classNames(
                                styles.chatSubmitButton,
                                styles.line,
                                styles.lineCircle,
                                styles.lineCircleSmall
                            )}
                        />
                    </div>
                </div>
            </div>

            <ChatMessageSkeleton />
            <ChatMessageSkeleton />
            <ChatMessageSkeleton />
        </div>
    )
}

const ChatMessageSkeleton: FC = props => {
    return (
        <div className={styles.message}>
            <header className={styles.header}>
                <div className={classNames(styles.line, styles.lineCircle)} />
                <div className={styles.line} />
            </header>

            <div className={styles.messageContent}>
                <div className={classNames(styles.line, styles.lineShortText)} />
                <div className={classNames(styles.line, styles.lineText)} />
                <div className={classNames(styles.line, styles.lineLongText)} />
                <div className={classNames(styles.line, styles.lineText)} />
                <div className={classNames(styles.line, styles.lineLongText)} />
                <div className={classNames(styles.line, styles.lineShortText)} />
                <div className={classNames(styles.line, styles.lineText)} />
                <div className={classNames(styles.line, styles.lineText)} />
                <div className={classNames(styles.line, styles.lineLongText)} />
                <div className={classNames(styles.line, styles.lineLongText)} />
            </div>
        </div>
    )
}
