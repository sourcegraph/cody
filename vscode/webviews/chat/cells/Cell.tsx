import { clsx } from 'clsx'
import type React from 'react'
import type { FunctionComponent, PropsWithChildren } from 'react'

/**
 * A cell is a row in a chat, which can be a human message, assistant message, context, notice, etc.
 */
export const Cell: FunctionComponent<
    PropsWithChildren<{
        header: React.ReactNode
        containerClassName?: string
        contentClassName?: string
        'aria-current'?: boolean
        'aria-disabled'?: boolean
        'data-testid'?: string
    }>
> = ({
    header,
    containerClassName,
    contentClassName,
    'aria-current': ariaCurrent,
    'aria-disabled': ariaDisabled,
    'data-testid': dataTestID,
    children,
}) => (
    <div
        className={clsx('tw-flex tw-flex-col tw-gap-4', containerClassName)}
        role="row"
        aria-current={ariaCurrent}
        aria-disabled={ariaDisabled}
        data-testid={dataTestID}
    >
        <header className="tw-flex tw-gap-4 tw-items-center [&_>_*]:tw-flex-shrink-0">{header}</header>
        <div className={clsx('tw-flex-1 tw-overflow-hidden', contentClassName)}>{children}</div>
    </div>
)
