/* eslint-disable no-sync */
import fs from 'fs'
import path from 'path'

import { WORKSPACE_PATH } from './common'

export const CURSOR = '~'

export interface TestCase {
    id: string
    prefix: string
    suffix: string
    solution: string
    test: string
    entrypoint: string
    // Only .py files are supported right now
    extension: 'py'
}

const getEvaluationPrefix = (entrypoint: string): string => `
from case import ${entrypoint}
import sys
`

const getEvaluationSuffix = (entrypoint: string): string => `
try:
    check(${entrypoint})
except AssertionError:
    sys.exit(1)
sys.exit(0)
`

interface TestCaseToRun extends TestCase {
    filePath: string
    evaluationPath: string
}

export const createTestCase = (testCase: TestCase): TestCaseToRun => {
    // Create folder for test case
    const caseDirPath = path.resolve(WORKSPACE_PATH, testCase.id)
    if (!fs.existsSync(caseDirPath)) {
        fs.mkdirSync(caseDirPath, { recursive: true })
    }

    // Create case file for generation
    const testCasePath = path.resolve(caseDirPath, 'case.py')
    fs.writeFileSync(testCasePath, `${testCase.prefix}${CURSOR}${testCase.suffix}`)

    // Create corresponding test file for evaluation
    const testPath = path.resolve(caseDirPath, 'test.py')
    const runnableTest = `${getEvaluationPrefix(testCase.entrypoint)}${testCase.test}${getEvaluationSuffix(
        testCase.entrypoint
    )}`
    fs.writeFileSync(testPath, runnableTest)

    return {
        ...testCase,
        filePath: testCasePath,
        evaluationPath: testPath,
    }
}
