import React, { useMemo } from 'react'

import classNames from 'classnames'

import { aggregateResults, TestResult } from '@sourcegraph/cody-e2e/src/test-results'

import styles from './QualityMetrics.module.css'

interface QualityMetricsProps {
    runs: TestResult[]
    variant: 'small' | 'normal' | 'large'
}

const variantToClass = {
    small: styles.qualityMetricsSmall,
    normal: styles.qualityMetricsNormal,
    large: styles.qualityMetricsLarge,
}

export const QualityMetrics: React.FunctionComponent<QualityMetricsProps> = ({ variant, runs }) => {
    const aggregatedResults = useMemo(() => aggregateResults(runs), [runs])
    return (
        <div className={classNames(styles.qualityMetricsContainer, variantToClass[variant])}>
            <div className={styles.qualityMetric}>
                <Ratio
                    numerator={aggregatedResults.incorrectAnswers + aggregatedResults.partialAnswers}
                    denominator={aggregatedResults.numInteractions}
                />
                <div className={styles.qualityMetricLabel}>incorrect or partial answers</div>
            </div>
            <div className={styles.qualityMetric}>
                <Ratio numerator={aggregatedResults.missingFacts} denominator={aggregatedResults.facts} />
                <div className={styles.qualityMetricLabel}>
                    missing <br />
                    facts
                </div>
            </div>
            <div className={styles.qualityMetric}>
                <Ratio
                    numerator={aggregatedResults.hallucinatedEntities}
                    denominator={aggregatedResults.detectedEntities}
                />
                <div className={styles.qualityMetricLabel}>
                    hallucinated <br />
                    entities
                </div>
            </div>
        </div>
    )
}

function ratioToColor(ratio: number): string {
    if (ratio <= 0.05) {
        return styles.qualityMetricGood
    }
    if (ratio <= 0.2) {
        return styles.qualityMetricMid
    }
    return styles.qualityMetricBad
}

const Ratio: React.FunctionComponent<{ numerator: number; denominator: number }> = ({ numerator, denominator }) => {
    if (denominator === 0) {
        return <div className={classNames(styles.qualityMetricValue, styles.qualityMetricValueMissing)}>/</div>
    }
    const ratio = numerator / denominator
    return <div className={classNames(styles.qualityMetricValue, ratioToColor(ratio))}>{Math.round(ratio * 100)}%</div>
}
