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
    footer?: React.ReactNode
    className?: string
}> = ({ speaker, speakerIcon, content, contentClassName, footer, className }) => (
    <Cell
        style={speaker === 'human' ? 'human' : 'assistant'}
        gutterIcon={speakerIcon}
        containerClassName={clsx(styles.cellContainer, className)}
        contentClassName={contentClassName}
        data-testid="message"
    >
        {content}
        {footer && <div className={styles.footer}>{footer}</div>}
    </Cell>
)
