import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter'

import { getAssetsDir, rmSyncWithRetries } from '../helpers'

// Test reporter that cleans up assets after a successful test run. It keeps uses the value of
// repeat-each to determine how many successful test runs it needs to see before it deletes
// assets related to the running test. Otherwise, it will leave the assets in place for debugging.
export default class GarbageCollectingReporter implements Reporter {
    repeatEach = 0
    runs = new Map<string, number>()

    onBegin(config: FullConfig, _: Suite) {
        this.repeatEach = config.projects[0]?.repeatEach || 1
        rmSyncWithRetries(getAssetsDir(''), { recursive: true, force: true })
    }

    onTestEnd(test: TestCase, result: TestResult) {
        const slug = this.toSlug(test)
        if (result.status === 'passed') {
            const successful = (this.runs.get(slug) || 0) + 1
            if (successful === this.repeatEach) {
                this.runs.delete(slug)
                rmSyncWithRetries(getAssetsDir(test.title), { recursive: true, force: true })
            } else {
                this.runs.set(slug, successful)
            }
        } else {
            this.runs.delete(slug)
        }
    }

    private toSlug(test: TestCase) {
        const { file, line, column } = test.location
        return `${file}:${line}:${column}`
    }
}
