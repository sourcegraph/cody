import React, { useMemo, useState } from 'react'

import { aggregateResults, AggregateTestResults, TestResult } from '@sourcegraph/cody-e2e/src/test-results'

import { parseTestResults, TestResults } from './parse-results'
import { QualityMetrics } from './QualityMetrics'
import { TestCase } from './TestCase'

import styles from './App.module.css'

interface TestCaseResult {
    runs: TestResult[]
    aggregate: AggregateTestResults
}

function zipIntoTestCases(runs: TestResult[][]): TestCaseResult[] {
    const runsPerTestCase: TestCaseResult[] = []
    for (let i = 0; i < runs[0].length; i++) {
        const testCaseRuns = runs.map(run => run[i])
        runsPerTestCase.push({ runs: testCaseRuns, aggregate: aggregateResults(testCaseRuns) })
    }
    return runsPerTestCase
}

export const App: React.FunctionComponent = () => {
    const [testResults, setTestResults] = useState<TestResults | null>(null)

    const onFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        if (!event.target.files) {
            return
        }
        const reader = new FileReader()
        reader.addEventListener('load', (ev: ProgressEvent<FileReader>): void => {
            if (!ev.target?.result || ev.target.result instanceof ArrayBuffer) {
                return
            }
            setTestResults(parseTestResults(ev.target.result))
        })
        reader.readAsText(event.target.files[0], 'UTF-8')
    }

    return (
        <div className={styles.container}>
            <div className={styles.content}>
                <h1>Inspect Cody end-to-end quality evaluation results</h1>
                <input type="file" onChange={onFileChange} />
                {testResults && <TestResultsSummary testResults={testResults} />}
                {testResults && <TestCases testResults={testResults} />}
            </div>
        </div>
    )
}

interface TestResultsSummaryProps {
    testResults: TestResults
}

const TestResultsSummary: React.FunctionComponent<TestResultsSummaryProps> = ({ testResults }) => {
    return (
        <div className={styles.summary}>
            <h2>Summary</h2>
            <div className={styles.summaryMetrics}>
                <QualityMetrics variant="large" runs={testResults.runs.flat()} />
            </div>
        </div>
    )
}

interface TestCasesProps {
    testResults: TestResults
}

type Order =
    | '%-incorrect-or-partial-answers-asc'
    | '%-incorrect-or-partial-answers-desc'
    | '%-missing-facts-asc'
    | '%-missing-facts-desc'
    | '%-hallucinated-entities-asc'
    | '%-hallucinated-entities-desc'

function incorrectOrPartialAnswersRatio(aggregate: AggregateTestResults): number {
    return (aggregate.incorrectAnswers + aggregate.partialAnswers) / aggregate.numInteractions
}

function hallucinatedEntitiesRatio(aggregate: AggregateTestResults): number {
    return aggregate.hallucinatedEntities / aggregate.detectedEntities
}

function missingFactsRatio(aggregate: AggregateTestResults): number {
    return aggregate.missingFacts / aggregate.facts
}

const TestCases: React.FunctionComponent<TestCasesProps> = ({ testResults }) => {
    const [order, setOrder] = useState<Order>('%-incorrect-or-partial-answers-desc')
    const [search, setSearch] = useState('')

    const testCases = useMemo(() => zipIntoTestCases(testResults.runs), [testResults])
    const filteredOrderedTestCases = useMemo(
        () =>
            testCases
                .filter(testCase => {
                    if (!search) {
                        return true
                    }
                    const searchTerm = search.toLowerCase().trim()
                    const label = testCase.runs[0].label
                    const codebase = testCase.runs[0].codebase
                    return label.toLowerCase().includes(searchTerm) || codebase.toLowerCase().includes(searchTerm)
                })
                .sort((a, b) => {
                    if (order === '%-incorrect-or-partial-answers-asc') {
                        return incorrectOrPartialAnswersRatio(a.aggregate) - incorrectOrPartialAnswersRatio(b.aggregate)
                    }
                    if (order === '%-incorrect-or-partial-answers-desc') {
                        return incorrectOrPartialAnswersRatio(b.aggregate) - incorrectOrPartialAnswersRatio(a.aggregate)
                    }
                    if (order === '%-missing-facts-asc') {
                        return missingFactsRatio(a.aggregate) - missingFactsRatio(b.aggregate)
                    }
                    if (order === '%-missing-facts-desc') {
                        return missingFactsRatio(b.aggregate) - missingFactsRatio(a.aggregate)
                    }
                    if (order === '%-hallucinated-entities-asc') {
                        return hallucinatedEntitiesRatio(a.aggregate) - hallucinatedEntitiesRatio(b.aggregate)
                    }
                    return hallucinatedEntitiesRatio(b.aggregate) - hallucinatedEntitiesRatio(a.aggregate)
                }),
        [testCases, order, search]
    )

    const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        setSearch(e.target.value)
    }

    const onOrderByChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
        setOrder(e.target.value as Order)
    }

    return (
        <div>
            <h2>Tests</h2>
            <div className={styles.controls}>
                <label htmlFor="search">Search:</label>
                <input id="search" className={styles.search} onChange={onSearchChange} value={search} />

                <label htmlFor="order-by">Order by:</label>
                <select id="order-by" className={styles.orderBySelect} value={order} onChange={onOrderByChange}>
                    <option value="%-incorrect-or-partial-answers-asc">% incorrect or partial answers ↑</option>
                    <option value="%-incorrect-or-partial-answers-desc">% incorrect or partial answers ↓</option>
                    <option value="%-missing-facts-asc">% missing facts ↑</option>
                    <option value="%-missing-facts-desc">% missing facts ↓</option>
                    <option value="%-hallucinated-entities-asc">% hallucinated entities ↑</option>
                    <option value="%-hallucinated-entities-desc">% hallucinated entities ↓</option>
                </select>
            </div>
            {filteredOrderedTestCases.map(testCase => (
                <TestCase key={testCase.runs[0].label} runs={testCase.runs} />
            ))}
        </div>
    )
}
