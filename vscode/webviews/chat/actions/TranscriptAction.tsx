import type React from 'react'

import { clsx } from 'clsx'

import styles from './TranscriptAction.module.css'

interface TranscriptActionStep {
    verb: string
    object: string | JSX.Element

    /**
     * The SVG path of an icon.
     * @example mdiSearchWeb
     */
    icon?: string
}

export const TranscriptAction: React.FunctionComponent<{
    title: string | { verb: string; object: string; tooltip?: string }
    steps: TranscriptActionStep[]
    className?: string
    onClick?: () => void
}> = ({ title, steps, className, onClick }) => {
    return (
        <details className={clsx(className, styles.container)}>
            <summary onClick={onClick} onKeyDown={onClick}>
                {typeof title === 'string' ? (
                    title
                ) : (
                    <span title={title.tooltip}>
                        {title.verb} <strong>{title.object}</strong>
                    </span>
                )}
            </summary>
            <div className={styles.steps}>
                {steps.map((step, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: no other natural key, and this is stable/immutable
                    <span key={index} className={styles.step}>
                        {step.object}
                    </span>
                ))}
            </div>
        </details>
    )
}
