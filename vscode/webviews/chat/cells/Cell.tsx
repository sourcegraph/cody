import { clsx } from 'clsx'
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
        'data-testid'?: string
    }>
> = ({
    style,
    gutterIcon,
    disabled,
    containerClassName,
    contentClassName,
    'data-testid': dataTestID,
    children,
}) => (
    <div
        className={clsx(
            styles.container,
            {
                [styles.containerStyleAssistant]: style === 'assistant',
                [styles.containerStyleContext]: style === 'context',
                [styles.containerDisabled]: disabled,
            },
            containerClassName
        )}
        role="row"
        data-testid={dataTestID}
    >
        <div className={styles.gutter}>{gutterIcon}</div>
        <div className={clsx(styles.content, contentClassName)}>{children}</div>
    </div>
)
