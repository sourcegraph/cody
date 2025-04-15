import type { ErrorWithDiff, Reporter, TaskResultPack } from 'vitest'

// Global flag to track if any tests have failed
export let hasTestFailures = false

class TestErrorReporter implements Reporter {
    private failures: Array<ErrorWithDiff> = []

    constructor() {
        hasTestFailures = false
    }

    onTaskUpdate(packs: TaskResultPack[]): void {
        for (const pack of packs) {
            const result = pack[1]
            if (result?.state === 'fail') {
                // Set the global flag when a test fails
                hasTestFailures = true
                for (const error of result.errors ?? []) {
                    this.failures.push(error)
                }
            }
        }
    }

    hasFailures(): boolean {
        return this.failures.length > 0
    }

    reset(): void {
        this.failures = []
        hasTestFailures = false
    }
}

export const TEST_ERROR_REPORTER = new TestErrorReporter()

export default TestErrorReporter
