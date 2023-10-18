import assert from 'assert'

/**
 * Environment config for the benchmark script.
 *
 * Note: This environment is not necessarily the same as the environment that is provided to VS Code.
 * See ./vscode/env.ts for VS Code specific environment configuration.
 */
import { DATASETS_PATH } from './constants'

assert(process.env.BENCHMARK_ENDPOINT, 'BENCHMARK_ENDPOINT is required')
assert(process.env.BENCHMARK_ACCESS_TOKEN, 'BENCHMARK_ACCESS_TOKEN is required')
assert(process.env.BENCHMARK_DOCKER_IMAGE, 'BENCHMARK_DOCKER_IMAGE is required')

export const BENCHMARK_ENDPOINT = process.env.BENCHMARK_ENDPOINT
export const BENCHMARK_ACCESS_TOKEN = process.env.BENCHMARK_ACCESS_TOKEN

/** Defaults to all datasets within ./datasets */
export const BENCHMARK_DATASET = process.env.BENCHMARK_DATASET || DATASETS_PATH

/** An external extension ID to benchmark, will be installed at runtime */
export const BENCHMARK_COMPARE_WITH = process.env.BENCHMARK_COMPARE_WITH

/** A user-to-server GitHub token that is required to authenticate with Copilot automatically */
export const BENCHMARK_COPILOT_TOKEN = process.env.BENCHMARK_COPILOT_TOKEN

/** Whether to use only automatic completions instead of manually triggering them */
export const BENCHMARK_AUTOMATIC_COMPLETIONS = process.env.BENCHMARK_AUTOMATIC_COMPLETIONS === 'true'

/** The Docker image to use for evaluating each test */
export const BENCHMARK_DOCKER_IMAGE = process.env.BENCHMARK_DOCKER_IMAGE
