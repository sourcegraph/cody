import assert from 'assert'

assert(process.env.BENCHMARK_ENDPOINT)
assert(process.env.BENCHMARK_ACCESS_TOKEN)

export const BENCHMARK_ENDPOINT = process.env.BENCHMARK_ENDPOINT
export const BENCHMARK_ACCESS_TOKEN = process.env.BENCHMARK_ACCESS_TOKEN
export const BENCHMARK_EXTENSION_ID = process.env.BENCHMARK_EXTENSION_ID
export const BENCHMARK_CONFIG_FILE = process.env.BENCHMARK_CONFIG_FILE

export const BENCHMARK_DATASET = process.env.BENCHMARK_DATASET || 'api-invocation' // todo
export const BENCHMARK_COMPARE_WITH = process.env.BENCHMARK_COMPARE_WITH
export const BENCHMARK_WORKSPACE = process.env.BENCHMARK_WORKSPACE
