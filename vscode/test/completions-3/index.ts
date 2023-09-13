import { createEvaluationFiles, TestCase } from './create-evaluation-cases'
import RandomSpanInfillingLight from './datasets/humaneval-infill/RandomSpanInfillingLight.json'
import { CaseResult, CaseStatus, evaluateCompletion } from './evaluate-test-case'
import { setup, teardown } from './helpers'

const singleLineTestCases: TestCase[] = []
const multiLineTestCases: TestCase[] = []

for (const testCase of RandomSpanInfillingLight) {
    if (testCase.solution.includes('\n')) {
        multiLineTestCases.push({ ...testCase, extension: 'py' })
    } else {
        singleLineTestCases.push({ ...testCase, extension: 'py' })
    }
}

export async function run(): Promise<void> {
    await setup()

    const results: CaseResult[] = []

    // Get evaluation cases from specified dataset
    // TODO

    // Filter any evaluation cases (e.g. if specified only to run specific id)
    // TODO

    for (const evalCase of singleLineTestCases) {
        const files = createEvaluationFiles(evalCase)
        const result = await evaluateCompletion(evalCase.id, files)
        console.log(`${result.status === CaseStatus.PASS ? '🟢' : '🔴'} - ${files.fileDirectory}`)
        results.push(result)
    }

    const failedResults = results.filter(result => result.status === CaseStatus.FAIL)
    if (failedResults.length > 0) {
        throw new Error(`There were ${failedResults.length} failures.`)
    }

    await teardown()
}
