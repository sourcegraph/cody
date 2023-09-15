import path from 'path'
import util from 'util'

import _glob from 'glob'

import { DATASETS_PATH } from './constants'
import { parseEvaluationConfig } from './datasets'
import { evaluateCompletion } from './evaluate-test-case'
import { cleanup, setup, teardown } from './helpers'

const glob = util.promisify(_glob)

export async function run(): Promise<void> {
    await setup()

    const dataset = 'CodeIntel'
    const datasetPath = path.join(DATASETS_PATH, dataset)
    const evaluationCases = await glob(path.join(datasetPath, '*'))

    for (const evalCase of evaluationCases) {
        const evalDir = path.basename(evalCase)
        const evalCaseConfig = parseEvaluationConfig(path.join(evalCase, 'config.json'))
        await evaluateCompletion(evalDir, evalCaseConfig, evalCase)
        await cleanup()
    }

    await new Promise(resolve => setTimeout(resolve, 1000000))
    await teardown()
}
