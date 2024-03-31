import classNames from 'classnames'
import type React from 'react'
import type { FunctionComponent, PropsWithChildren } from 'react'
import styles from './Cell.module.css'

/**
 * A cell is a row in a chat, which can be a human message, assistant message, context, notice, etc.
 */
export const Cell: FunctionComponent<
    PropsWithChildren<{
        style?: 'human' | 'context' | 'assistant'
        gutterIcon: React.ReactNode
        disabled?: boolean
        containerClassName?: string
        contentClassName?: string
    }>
> = ({ style, gutterIcon, disabled, containerClassName, contentClassName, children }) => (
    <div
        className={classNames(
            styles.container,
            {
                [styles.containerStyleAssistant]: style === 'assistant',
                [styles.containerStyleContext]: style === 'context',
                [styles.containerDisabled]: disabled,
            },
            containerClassName
        )}
    >
        <div className={styles.gutter}>{gutterIcon}</div>
        <div className={classNames(styles.content, contentClassName)}>{children}</div>
    </div>
)
