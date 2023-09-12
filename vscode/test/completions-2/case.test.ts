import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { createTestCase, TestCase } from './create-test-case'
import { evaluateCompletion } from './evaluate-test-case'
import { test } from './helpers'
import pythonSet from './light.json'

const singleLineTestCases: TestCase[] = []
const multiLineTestCases: TestCase[] = []

for (const testCase of pythonSet) {
    const transformedTestCase: TestCase = {
        id: testCase.task_id,
        prefix: testCase.prompt,
        suffix: testCase.suffix,
        solution: testCase.canonical_solution,
        test: testCase.test,
        entrypoint: testCase.entry_point,
        extension: 'py',
    }

    if (transformedTestCase.solution.includes('\n')) {
        multiLineTestCases.push(transformedTestCase)
    } else {
        singleLineTestCases.push(transformedTestCase)
    }
}

test.describe('Single Line Test Cases', () => {
    for (const testCase of singleLineTestCases) {
        test(testCase.id, async ({ page, sidebar }) => {
            await sidebarSignin(page, sidebar)
            const { filePath, evaluationPath } = createTestCase(testCase)
            const result = await evaluateCompletion(page, filePath, evaluationPath)
            //
            expect(result.passed).toBe(true)
        })
    }
})
