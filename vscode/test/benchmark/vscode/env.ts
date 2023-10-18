import assert from 'assert'

assert(process.env.BENCHMARK_EXTENSION_ID, 'BENCHMARK_EXTENSION_ID is required')
assert(process.env.BENCHMARK_WORKSPACE, 'BENCHMARK_WORKSPACE is required')
assert(process.env.BENCHMARK_CONFIG_FILE, 'BENCHMARK_CONFIG_FILE is required')

export const BENCHMARK_EXTENSION_ID = process.env.BENCHMARK_EXTENSION_ID
export const BENCHMARK_WORKSPACE = process.env.BENCHMARK_WORKSPACE
export const BENCHMARK_CONFIG_FILE = process.env.BENCHMARK_CONFIG_FILE
export const BENCHMARK_EXTENSION_MANUAL_SETUP = process.env.BENCHMARK_EXTENSION_MANUAL_SETUP === 'true'
