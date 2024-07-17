import styles from './LoadingPage.module.css'

export const LoadingPage: React.FunctionComponent = () => (
    <div className={styles.container}>
        <LoadingDots />
    </div>
)

const LoadingDots: React.FunctionComponent = () => (
    <div className={styles.dotsHolder}>
        <div className={styles.dot} />
        <div className={styles.dot} />
        <div className={styles.dot} />
    </div>
)
