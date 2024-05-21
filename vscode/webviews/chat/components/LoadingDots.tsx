import type { FunctionComponent } from 'react'
import styles from './LoadingDots.module.css'

export const LoadingDots: FunctionComponent = () => (
    <div className={styles.dotsHolder} role="status" aria-busy={true}>
        <div className={styles.dot} />
        <div className={styles.dot} />
        <div className={styles.dot} />
    </div>
)
