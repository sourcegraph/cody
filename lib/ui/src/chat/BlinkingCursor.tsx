import type React from 'react'

import { useEnhancedContextEnabled } from './components/EnhancedContext'

import styles from './BlinkingCursor.module.css'

export const BlinkingCursor: React.FunctionComponent = () => <span className={styles.cursor} />

export const LoadingContext: React.FunctionComponent = () => {
    const isEnhancedContextEnabled = useEnhancedContextEnabled()
    return (
        <div className={styles.loadingContainer}>
            {isEnhancedContextEnabled ? '✨' : ''}
            <LoadingDots />
        </div>
    )
}

const LoadingDots: React.FunctionComponent = () => (
    <div className={styles.dotsHolder}>
        <div className={styles.dot} />
        <div className={styles.dot} />
        <div className={styles.dot} />
    </div>
)
