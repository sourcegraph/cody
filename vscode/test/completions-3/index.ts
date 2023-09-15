import path from 'path'
import util from 'util'

import _glob from 'glob'

import { DATASETS_PATH } from './constants'
import { parseEvaluationConfig } from './datasets'
import { CaseStatus, evaluateCompletion } from './evaluate-test-case'
import { cleanup, setup, teardown } from './helpers'

const glob = util.promisify(_glob)

interface Result {
    status: CaseStatus
    id: string
}

export async function run(): Promise<void> {
    await setup()

    const dataset = 'api-invocation'
    const datasetPath = path.join(DATASETS_PATH, dataset)
    const evaluationCases = await glob(path.join(datasetPath, '*'))
    const results: Result[] = []

    for (const evalCase of evaluationCases) {
        const id = path.basename(evalCase)
        const evalCaseConfig = parseEvaluationConfig(path.join(evalCase, 'config.json'))
        results.push({
            id,
            status: await evaluateCompletion(id, evalCaseConfig, evalCase),
        })
        await cleanup()
    }

    console.log('Failing tests:')
    for (const result of results) {
        if (result.status === CaseStatus.FAIL) {
            console.log(`🔴 ${result.id}`)
        }
    }

    await new Promise(resolve => setTimeout(resolve, 1000000))
    await teardown()
}
