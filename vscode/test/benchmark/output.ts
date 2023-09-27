import { readFileSync, writeFileSync } from 'fs'
import path from 'path'

import { OUTPUT_PATH, OUTPUT_TEMPLATE } from './constants'
import { CaseStatus } from './evaluate-test-case'

export interface BenchmarkResult {
    benchmarkId: string
    extensionId: string
    status: CaseStatus
    path: string
}

interface BenchmarkOutput {
    benchmarks: BenchmarkResult[]
}

export function parseOutput(): BenchmarkOutput {
    const file = readFileSync(OUTPUT_TEMPLATE, 'utf8')
    const config = JSON.parse(file) as BenchmarkOutput
    return config
}

export function writeBenchmarkResultsToOutput(results: BenchmarkResult[]): void {
    const output = parseOutput()
    output.benchmarks.push(...results)
    const outFile = path.join(OUTPUT_PATH, 'result.json')
    return writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8')
}
