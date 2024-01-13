import React from 'react'

import styles from './BlinkingCursor.module.css'

export const BlinkingCursor: React.FunctionComponent = () => <span className={styles.cursor} />

export const LoadingContext: React.FunctionComponent = () => (
    <div className={styles.loadingContainer}>
        ✨ <LoadingDots />
    </div>
)

const LoadingDots: React.FunctionComponent = () => (
    <div className={styles.dotsHolder}>
        <div className={styles.dot} />
        <div className={styles.dot} />
        <div className={styles.dot} />
    </div>
)
