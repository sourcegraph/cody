import React from 'react'

import styles from './BlinkingCursor.module.css'

export const BlinkingCursor: React.FunctionComponent = () => <span className={styles.cursor} />

export const ContextFetching: React.FunctionComponent = () => (
    <div className={styles.loadingContainer}>
        ✨ Fetch Contexting
        <LoadingDots />
    </div>
)

export const LoadingDots: React.FunctionComponent = () => (
    <div className={styles.dotsHolder}>
        <div className={styles.dot} />
        <div className={styles.dot} />
        <div className={styles.dot} />
    </div>
)
