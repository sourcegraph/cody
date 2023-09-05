import { TestResult } from '@sourcegraph/cody-e2e/src/test-results'

export interface TestResults {
    runs: TestResult[][]
}

export function parseTestResults(file: string): TestResults {
    return JSON.parse(file) as TestResults
}
