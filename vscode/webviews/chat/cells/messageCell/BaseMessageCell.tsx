import type { ChatMessage } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import type { FunctionComponent } from 'react'
import { Cell } from '../Cell'
import styles from './BaseMessageCell.module.css'

/**
 * The base component for messages.
 */
export const BaseMessageCell: FunctionComponent<{
    speaker: ChatMessage['speaker']
    speakerIcon?: React.ReactNode
    content: React.ReactNode
    contentClassName?: string
    focused?: boolean
    disabled?: boolean
    footer?: React.ReactNode
    className?: string
}> = ({ speaker, speakerIcon, content, contentClassName, focused, disabled, footer, className }) => (
    <Cell
        style={speaker === 'human' ? 'human' : 'assistant'}
        gutterIcon={speakerIcon}
        containerClassName={clsx(
            styles.cellContainer,
            {
                [styles.focused]: focused,
                [styles.disabled]: disabled,
            },
            className
        )}
        contentClassName={contentClassName}
        aria-disabled={disabled}
        aria-current={focused}
        data-testid="message"
    >
        {content}
        {footer && <div className={styles.footer}>{footer}</div>}
    </Cell>
)
