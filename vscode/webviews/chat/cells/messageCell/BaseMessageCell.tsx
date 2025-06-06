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
    speaker?: 'human' | 'assistant'
}> = ({ cellAction, content, contentClassName, footer, className, speaker }) => (
    <Cell
        header={cellAction && <div className="tw-ml-auto">{cellAction}</div>}
        containerClassName={className}
        contentClassName={contentClassName}
        data-testid="message"
        data-role={speaker}
    >
        {content}
        {footer}
    </Cell>
)
