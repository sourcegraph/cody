import chalk from 'chalk'

import { FactCheck } from './fact-check'
import { LLMJudgement } from './llm-judge'
import { InteractionTestCase, TestCase } from './test-cases'

export interface InteractionTestCaseResult extends InteractionTestCase, FactCheck, LLMJudgement {
    answer: string
}

export interface TestResult extends Omit<TestCase, 'transcript'> {
    transcript: InteractionTestCaseResult[]
}

export interface AggregateTestResults {
    missingFacts: number
    facts: number
    hallucinatedEntities: number
    detectedEntities: number
    correctAnswers: number
    incorrectAnswers: number
    partialAnswers: number
    numInteractions: number
}

function colorFn(partial: number, total: number, opts: ColorOptions): typeof chalk.green {
    const ratio = partial / total
    if (opts.higherIsBetter) {
        if (ratio >= opts.goodRatioThreshold) {
            return chalk.green
        }
        if (ratio >= opts.okRatioThreshold) {
            return chalk.yellow
        }
        return chalk.red
    }

    if (ratio <= opts.goodRatioThreshold) {
        return chalk.green
    }
    if (ratio <= opts.okRatioThreshold) {
        return chalk.yellow
    }
    return chalk.red
}

interface ColorOptions {
    higherIsBetter?: boolean
    goodRatioThreshold: number
    okRatioThreshold: number
}

function logResult(label: string, partial: number, total: number, opts: ColorOptions): void {
    if (total === 0) {
        return
    }
    console.log(
        colorFn(partial, total, opts)(`${label}: ${partial}/${total} (${Math.round((partial / total) * 100)}%)`)
    )
}

export function logAggregateResults(aggregateResults: AggregateTestResults): void {
    logResult('Incorrect answers (LLM judge)', aggregateResults.incorrectAnswers, aggregateResults.numInteractions, {
        goodRatioThreshold: 0.1,
        okRatioThreshold: 0.4,
    })
    logResult(
        'Incorrect or partial answers (LLM judge)',
        aggregateResults.incorrectAnswers + aggregateResults.partialAnswers,
        aggregateResults.numInteractions,
        {
            goodRatioThreshold: 0.1,
            okRatioThreshold: 0.4,
        }
    )
    logResult('Missing facts', aggregateResults.missingFacts, aggregateResults.facts, {
        goodRatioThreshold: 0.1,
        okRatioThreshold: 0.4,
    })
    logResult('Hallucinated entities', aggregateResults.hallucinatedEntities, aggregateResults.detectedEntities, {
        goodRatioThreshold: 0.1,
        okRatioThreshold: 0.4,
    })
}

export function aggregateResults(results: TestResult[]): AggregateTestResults {
    const interactions = results.flatMap(result => result.transcript)
    return interactions.reduce(
        (acc, interaction) => {
            if (interaction.answerMatchesSummary === 'yes') {
                acc.correctAnswers += 1
            } else if (interaction.answerMatchesSummary === 'no') {
                acc.incorrectAnswers += 1
            } else if (interaction.answerMatchesSummary === 'partial') {
                acc.partialAnswers += 1
            }

            acc.hallucinatedEntities += interaction.hallucinatedEntities.length
            acc.detectedEntities += interaction.detectedEntities.length

            acc.missingFacts += interaction.missingFacts.length
            acc.facts += interaction.facts.length

            return acc
        },
        {
            missingFacts: 0,
            facts: 0,
            hallucinatedEntities: 0,
            detectedEntities: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            partialAnswers: 0,
            numInteractions: interactions.length,
        }
    )
}
