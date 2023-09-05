import React, { useMemo, useState } from 'react'

import classNames from 'classnames'

import { DetectedEntity } from '@sourcegraph/cody-e2e/src/entity-detection'
import { Fact } from '@sourcegraph/cody-e2e/src/test-cases'
import { InteractionTestCaseResult, TestResult } from '@sourcegraph/cody-e2e/src/test-results'

import { QualityMetrics } from './QualityMetrics'

import styles from './TestCase.module.css'

export const TestCase: React.FunctionComponent<{ runs: TestResult[] }> = ({ runs }) => {
    const [showTranscripts, setShowTranscripts] = useState(false)
    return (
        <div className={styles.root}>
            <div
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                className={classNames(styles.header, showTranscripts && styles.selected)}
                onClick={() => setShowTranscripts(!showTranscripts)}
                onKeyDown={e => e.key === 'Enter' && setShowTranscripts(!showTranscripts)}
                role="presentation"
            >
                <div className={styles.summary}>
                    <div className={styles.labelWithMetadata}>
                        <div className={styles.label}>{runs[0].label}</div>
                        <div className={styles.metadata}>
                            {runs[0].codebase} &middot; {runs[0].context}
                        </div>
                    </div>
                    <QualityMetrics variant="normal" runs={runs} />
                </div>
            </div>
            {showTranscripts && <Transcripts runs={runs} />}
        </div>
    )
}

const Transcripts: React.FunctionComponent<{ runs: TestResult[] }> = ({ runs }) => {
    const [runIndex, setRunIndex] = useState(0)
    const run = useMemo(() => runs[runIndex], [runs, runIndex])
    return (
        <div className={styles.transcripts}>
            <div className={styles.transcriptsSummaries}>
                {runs.map((run, idx) => (
                    <div
                        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                        tabIndex={0}
                        // eslint-disable-next-line react/no-array-index-key
                        key={`run-${idx}`}
                        className={classNames(styles.transcriptSummary, idx === runIndex && styles.selected)}
                        onClick={() => setRunIndex(idx)}
                        onKeyDown={e => e.key === 'Enter' && setRunIndex(idx)}
                        role="presentation"
                    >
                        <div className={styles.transcriptSummaryLabel}>Run {idx + 1}</div>
                        <QualityMetrics variant="small" runs={[run]} />
                    </div>
                ))}
            </div>
            <div className={styles.transcriptLabel}>Transcript of Run {runIndex + 1}</div>
            <Transcript transcript={run.transcript} />
        </div>
    )
}

const Transcript: React.FunctionComponent<{ transcript: InteractionTestCaseResult[] }> = ({ transcript }) => {
    return (
        <div className={styles.transcript}>
            {transcript.map(interaction => (
                <Interaction key={interaction.question} interaction={interaction} />
            ))}
        </div>
    )
}

const llmJudgementToLabel = {
    yes: 'Correct answer',
    no: 'Wrong answer',
    partial: 'Partial answer',
    unknown: 'Unknown answer',
}

const llmJudgementToClass = {
    yes: styles.llmJudgementCorrectAnswer,
    no: styles.llmJudgementWrongAnswer,
    partial: styles.llmJudgementPartialAnswer,
    unknown: styles.llmJudgementUnknownAnswer,
}

const Interaction: React.FunctionComponent<{ interaction: InteractionTestCaseResult }> = ({ interaction }) => {
    const [showContext, setShowContext] = useState(false)
    const toggleShowContext = (): void => setShowContext(!showContext)

    const llmJudgementLabel = llmJudgementToLabel[interaction.answerMatchesSummary]
    const llmJudgementClass = llmJudgementToClass[interaction.answerMatchesSummary]
    return (
        <div className={styles.interaction}>
            <div className={styles.interactionQuestionWithAnswer}>
                <div className={styles.interactionQuestion}>
                    <div className={styles.interactionLabel}>Question</div>
                    <pre className={styles.snippet}>{interaction.question}</pre>
                </div>
                <div className={styles.interactionAnswer}>
                    <div className={styles.interactionLabel}>Answer</div>
                    <pre className={styles.snippet}>{interaction.answer.trimStart()}</pre>
                </div>
                <div className={styles.interactionContext}>
                    <div className={styles.interactionLabel}>
                        {interaction.contextMessages.length > 0 && (
                            <button
                                type="button"
                                onClick={toggleShowContext}
                                className={styles.toggleShowContextButton}
                            >
                                {showContext ? '-' : '+'}
                            </button>
                        )}
                        Context
                    </div>
                    {interaction.contextMessages.length === 0 && <i>No context messages provided.</i>}
                    {showContext &&
                        interaction.contextMessages.map(message => (
                            <pre key={message.text} className={classNames(styles.snippet, styles.contextMessage)}>
                                <span className={styles.contextMessageSpeaker}>{message.speaker.toUpperCase()}</span>:{' '}
                                {message.text}
                            </pre>
                        ))}
                </div>
            </div>
            <div className={styles.interactionEvaluation}>
                <div className={styles.interactionLabel}>Evaluation</div>

                <div className={styles.interactionEvaluationSection}>
                    <div className={styles.interactionEvaluationSectionLabel}>
                        <span className={classNames(styles.llmJudgementAnswer, llmJudgementClass)}>
                            LLM Judge - {llmJudgementLabel}
                        </span>
                    </div>
                    <pre className={styles.snippet}>{interaction.answerMatchesSummaryJudgement.trimStart()}</pre>
                </div>

                <div className={styles.interactionEvaluationSection}>
                    <div className={styles.interactionEvaluationSectionLabel}>Facts</div>
                    {interaction.facts.length === 0 && (
                        <div>
                            <i>No facts provided.</i>
                        </div>
                    )}
                    {interaction.facts.length > 0 && (
                        <Facts facts={interaction.facts} missingFacts={interaction.missingFacts} />
                    )}
                </div>

                <div className={styles.interactionEvaluationSection}>
                    <div className={styles.interactionEvaluationSectionLabel}>Detected Entities</div>
                    {interaction.detectedEntities.length === 0 && (
                        <div>
                            <i>No entities detected in the answer.</i>
                        </div>
                    )}
                    {interaction.detectedEntities.length > 0 && (
                        <DetectedEntities
                            detectedEntities={interaction.detectedEntities}
                            hallucinatedEntities={interaction.hallucinatedEntities}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}

const Facts: React.FunctionComponent<{ facts: Fact[]; missingFacts: Fact[] }> = ({ facts, missingFacts }) => {
    const presentFacts = useMemo(
        () => facts.filter(fact => !missingFacts.find(mf => mf.type === fact.type && mf.value === fact.value)),
        [facts, missingFacts]
    )
    return (
        <ul className={styles.list}>
            {missingFacts.map(fact => (
                <li key={fact.value}>
                    <span
                        title="Fact is missing in the answer."
                        className={classNames(styles.highlight, styles.highlightWrong)}
                    >
                        {fact.value}
                    </span>
                </li>
            ))}
            {presentFacts.map(fact => (
                <li key={fact.value}>
                    <span
                        title="Fact is found in the answer."
                        className={classNames(styles.highlight, styles.highlightCorrect)}
                    >
                        {fact.value}
                    </span>
                </li>
            ))}
        </ul>
    )
}

const DetectedEntities: React.FunctionComponent<{
    detectedEntities: DetectedEntity[]
    hallucinatedEntities: DetectedEntity[]
}> = ({ detectedEntities, hallucinatedEntities }) => {
    const validEntities = useMemo(
        () =>
            detectedEntities.filter(e => !hallucinatedEntities.find(he => he.type === e.type && he.value === e.value)),
        [detectedEntities, hallucinatedEntities]
    )
    return (
        <ul className={styles.list}>
            {hallucinatedEntities.map(({ value }) => (
                <li key={value}>
                    <span title="Hallucinated entity." className={classNames(styles.highlight, styles.highlightWrong)}>
                        {value}
                    </span>
                </li>
            ))}
            {validEntities.map(({ value }) => (
                <li key={value}>
                    <span title="Valid entity." className={classNames(styles.highlight, styles.highlightCorrect)}>
                        {value}
                    </span>
                </li>
            ))}
        </ul>
    )
}
