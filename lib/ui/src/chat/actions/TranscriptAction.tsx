import React from 'react'

import classNames from 'classnames'

import { Icon } from '../../utils/Icon'

import styles from './TranscriptAction.module.css'

export interface TranscriptActionStep {
    verb: string
    object: string | JSX.Element

    /**
     * The SVG path of an icon.
     * @example mdiSearchWeb
     */
    icon?: string
}

export const TranscriptAction: React.FunctionComponent<{
    title: string | { verb: string; object: string }
    steps: TranscriptActionStep[]
    className?: string
}> = ({ title, steps, className }) => {
    return (
        <div className={classNames(className, styles.container, styles.containerOpen)}>
            <div className={styles.steps}>
                {typeof title === 'string' ? (
                    title
                ) : (
                    <span>
                        {title.verb} <strong>{title.object}</strong>
                    </span>
                )}

                {steps.map((step, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <span key={index} className={styles.step}>
                        {step.icon && <Icon svgPath={step.icon} className={styles.stepIcon} />}{' '}
                        <span className={styles.stepObject}>
                            {step.verb} {step.object}
                        </span>
                    </span>
                ))}
            </div>
        </div>
    )
}
