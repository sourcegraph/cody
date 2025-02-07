import type { FunctionComponent } from 'react'
import { Cell } from '../Cell'

/**
 * The base component for messages.
 */
export const BaseMessageCell: FunctionComponent<{
    cellAction?: React.ReactNode
    content: React.ReactNode
    contentClassName?: string
    footer?: React.ReactNode
    className?: string
}> = ({ cellAction, content, contentClassName, footer, className }) => (
    <Cell
        header={<div className="tw-ml-auto">{cellAction}</div>}
        containerClassName={className}
        contentClassName={contentClassName}
        data-testid="message"
    >
        {content}
        {footer}
    </Cell>
)
