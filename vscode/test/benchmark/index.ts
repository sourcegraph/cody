import path from 'path'

import { BENCHMARK_CONFIG_FILE, BENCHMARK_EXTENSION_ID, BENCHMARK_WORKSPACE } from './config'
import { parseEvaluationConfig } from './datasets'
import { executeCompletion } from './execute-completion'
import { initExtension } from './helpers'

export async function run(): Promise<void> {
    if (!BENCHMARK_EXTENSION_ID) {
        throw new Error('No benchmark extension specified')
    }
    if (!BENCHMARK_CONFIG_FILE) {
        throw new Error('No config file specified')
    }
    if (!BENCHMARK_WORKSPACE) {
        throw new Error('No workspace specified')
    }

    await initExtension(BENCHMARK_EXTENSION_ID)
    const evalCaseConfig = parseEvaluationConfig(BENCHMARK_CONFIG_FILE)
    const dir = path.dirname(BENCHMARK_CONFIG_FILE)
    const id = path.basename(dir)

    await executeCompletion(id, evalCaseConfig, dir, BENCHMARK_WORKSPACE)
}
