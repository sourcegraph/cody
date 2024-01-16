import React from 'react'

import classNames from 'classnames'

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
}> = ({ title, steps, className }) => {
    return (
        <details className={classNames(className, styles.container)}>
            <summary>
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
                    <span key={index} className={styles.step}>
                        {step.object}
                    </span>
                ))}
            </div>
        </details>
    )
}
