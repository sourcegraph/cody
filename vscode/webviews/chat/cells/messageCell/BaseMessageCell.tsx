import type { ChatMessage } from '@sourcegraph/cody-shared'
import type { FunctionComponent } from 'react'
import { Cell } from '../Cell'

/**
 * The base component for messages.
 */
export const BaseMessageCell: FunctionComponent<{
    speaker: ChatMessage['speaker']
    speakerIcon?: React.ReactNode
    content: React.ReactNode
    contentClassName?: string
    footer?: React.ReactNode
    className?: string
}> = ({ speaker, speakerIcon, content, contentClassName, footer, className }) => (
    <Cell
        style={speaker === 'human' ? 'human' : 'assistant'}
        gutterIcon={speakerIcon}
        containerClassName={className}
        contentClassName={contentClassName}
        data-testid="message"
    >
        {content}
        {footer}
    </Cell>
)

export const MESSAGE_CELL_AVATAR_SIZE = 27.5
