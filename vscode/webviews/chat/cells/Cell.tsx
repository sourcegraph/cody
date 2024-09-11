import { clsx } from 'clsx'
import type React from 'react'
import type { PropsWithChildren } from 'react'
import { forwardRef } from 'react'

interface CellProps {
    header: React.ReactNode
    containerClassName?: string
    contentClassName?: string
    'aria-current'?: boolean
    'aria-disabled'?: boolean
    'data-testid'?: string
}
/**
 * A cell is a row in a chat, which can be a human message, assistant message, context, notice, etc.
 */
export const Cell = forwardRef<HTMLDivElement, PropsWithChildren<CellProps>>((props, ref) => {
    const {
        header,
        containerClassName,
        contentClassName,
        'aria-current': ariaCurrent,
        'aria-disabled': ariaDisabled,
        'data-testid': dataTestID,
        children,
    } = props

    return (
        <div
            ref={ref}
            className={clsx('tw-flex tw-flex-col tw-gap-4', containerClassName)}
            role="row"
            aria-current={ariaCurrent}
            aria-disabled={ariaDisabled}
            data-testid={dataTestID}
        >
            <header className="tw-flex tw-gap-4 tw-items-center [&_>_*]:tw-flex-shrink-0">
                {header}
            </header>
            <div className={clsx('tw-flex-1', contentClassName)}>{children}</div>
        </div>
    )
})
