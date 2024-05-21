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
        containerClassName?: string
        contentClassName?: string
        'aria-current'?: boolean
        'aria-disabled'?: boolean
        'data-testid'?: string
    }>
> = ({
    style,
    gutterIcon,
    containerClassName,
    contentClassName,
    'aria-current': ariaCurrent,
    'aria-disabled': ariaDisabled,
    'data-testid': dataTestID,
    children,
}) => (
    <div
        className={clsx(
            styles.container,
            {
                [styles.containerStyleAssistant]: style === 'assistant',
                [styles.containerStyleContext]: style === 'context',
                [styles.containerDisabled]: ariaDisabled,
            },
            containerClassName
        )}
        role="row"
        aria-current={ariaCurrent}
        aria-disabled={ariaDisabled}
        data-testid={dataTestID}
    >
        <div className={styles.gutter}>{gutterIcon}</div>
        <div className={clsx(styles.content, contentClassName)}>{children}</div>
    </div>
)
