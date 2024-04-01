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
        containerClassName?: string
        contentClassName?: string
        'data-testid'?: string
    }>
> = ({
    style,
    gutterIcon,
    containerClassName,
    contentClassName,
    'data-testid': dataTestID,
    children,
}) => (
    <div
        className={classNames(
            styles.container,
            {
                [styles.containerStyleAssistant]: style === 'assistant',
                [styles.containerStyleContext]: style === 'context',
            },
            containerClassName
        )}
        role="row"
        data-testid={dataTestID}
    >
        <div className={styles.gutter}>{gutterIcon}</div>
        <div className={classNames(styles.content, contentClassName)}>{children}</div>
    </div>
)
