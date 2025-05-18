import { AnimatePresence, motion } from 'framer-motion'
import { LoaderIcon } from 'lucide-react'
import { useCallback, useState } from 'react'

import styles from './ThinkingCell.module.css'

/**
 * Props for the ThinkingCell component
 */
interface ThinkingCellProps {
    /** Whether the agent is currently thinking */
    isThinking: boolean
    /** The thought content to display */
    thought: string
    /** Whether the thought bubble is expanded */
    isOpen: boolean
    /** Function to set the expanded state */
    setIsOpen: (open: boolean) => void
}

const CELL_NAME = 'thinking-space'

/**
 * A component that displays the thought process of the AI agent.
 * It shows a thinking indicator when the agent is processing,
 * and can be expanded to show the thought content.
 */
export function ThinkingCell({ isThinking, thought, isOpen, setIsOpen }: ThinkingCellProps) {
    const variants = {
        collapsed: {
            height: 0,
            opacity: 0,
            marginTop: 0,
            marginBottom: 0,
        },
        expanded: {
            height: 'auto',
            opacity: 1,
            marginTop: '0.5rem',
            marginBottom: '0.5rem',
        },
    }

    const [accordionValue, setAccordionValue] = useState<string | undefined>(
        isOpen ? CELL_NAME : undefined
    )

    const triggerAccordion = useCallback(() => {
        setAccordionValue(prev => {
            const prevIsOpen = prev === CELL_NAME
            setIsOpen(!prevIsOpen)
            return prevIsOpen ? undefined : CELL_NAME
        })
    }, [setIsOpen])

    return (
        <div className={styles.thinkingContainer}>
            <div 
                className={styles.thinkingHeader} 
                onClick={triggerAccordion}
                onKeyUp={e => e.key === 'Enter' && triggerAccordion()}
                tabIndex={0}
                role="button"
                aria-expanded={isOpen}
            >
                {isThinking ? <LoaderIcon size={16} className={styles.spinnerIcon} /> : null}
                <span className={styles.headerText}>
                    {isThinking ? 'Thinking' : 'Thought Process'}
                </span>
                <span className={styles.expandIcon}>{isOpen ? '▼' : '▶'}</span>
            </div>

            <AnimatePresence initial={false}>
                {isOpen ? (
                    <motion.div
                        key="content"
                        initial="collapsed"
                        animate="expanded"
                        exit="collapsed"
                        variants={variants}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        style={{ overflow: 'hidden' }}
                        className={styles.thoughtContent}
                    >
                        {thought}
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    )
}