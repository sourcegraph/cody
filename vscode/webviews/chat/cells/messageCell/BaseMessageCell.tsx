import type { FunctionComponent } from 'react'
import { Cell } from '../Cell'

/**
 * The base component for messages.
 */
export const BaseMessageCell: FunctionComponent<{
    speakerIcon?: React.ReactNode
    speakerTitle?: React.ReactNode
    cellAction?: React.ReactNode
    content: React.ReactNode
    contentClassName?: string
    footer?: React.ReactNode
    className?: string
}> = ({ speakerIcon, speakerTitle, cellAction, content, contentClassName, footer, className }) => (
    <Cell
        header={
            <>
                {speakerIcon} <span className="tw-mt-[-1px] tw-font-semibold">{speakerTitle}</span>
                <div className="tw-ml-auto">{cellAction}</div>
            </>
        }
        containerClassName={className}
        contentClassName={contentClassName}
        data-testid="message"
    >
        {content}
        {footer}
    </Cell>
)

export const MESSAGE_CELL_AVATAR_SIZE = 20
