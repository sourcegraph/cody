import assert from 'assert'

assert(process.env.BENCHMARK_EXTENSION_ID)
assert(process.env.BENCHMARK_WORKSPACE)
assert(process.env.BENCHMARK_CONFIG_FILE)

export const BENCHMARK_EXTENSION_ID = process.env.BENCHMARK_EXTENSION_ID
export const BENCHMARK_WORKSPACE = process.env.BENCHMARK_WORKSPACE
export const BENCHMARK_CONFIG_FILE = process.env.BENCHMARK_CONFIG_FILE
