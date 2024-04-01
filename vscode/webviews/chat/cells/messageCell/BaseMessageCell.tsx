import type { ChatMessage } from '@sourcegraph/cody-shared'
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
    footer?: React.ReactNode
}> = ({ speaker, speakerIcon, content, footer }) => (
    <Cell
        style={speaker === 'human' ? 'human' : 'assistant'}
        gutterIcon={speakerIcon}
        containerClassName={styles.cellContainer}
        data-testid="message"
    >
        {content}
        {footer && <div className={styles.footer}>{footer}</div>}
    </Cell>
)
