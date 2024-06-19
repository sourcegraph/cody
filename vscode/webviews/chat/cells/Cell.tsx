import { clsx } from 'clsx'
import type React from 'react'
import type { FunctionComponent, PropsWithChildren } from 'react'
import { MESSAGE_CELL_AVATAR_SIZE } from './messageCell/BaseMessageCell'

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
        className={clsx('tw-flex tw-gap-4', containerClassName)}
        role="row"
        aria-current={ariaCurrent}
        aria-disabled={ariaDisabled}
        data-testid={dataTestID}
    >
        <div
            className="tw-pt-[3px] tw-flex tw-items-top tw-justify-center"
            style={{ width: `${MESSAGE_CELL_AVATAR_SIZE}px` }}
        >
            {gutterIcon}
        </div>
        <div className={clsx('tw-flex-1', contentClassName)}>{children}</div>
    </div>
)
