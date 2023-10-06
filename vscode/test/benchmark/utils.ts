import { exec as _exec } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { copyFile, cp, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'

import { TEST_WORKSPACE_PATH } from './constants'
import { CaseStatus } from './evaluate-test-case'
import { commitSignatureEnv } from './git'

const exec = promisify(_exec)

export const copyFileToDir = async (cwd: string, fileName: string, newDir: string): Promise<string> => {
    const filePath = path.join(cwd, fileName)
    const newFilePath = path.join(newDir, path.basename(filePath))
    await copyFile(filePath, newFilePath)
    return newFilePath
}

export const createTemporaryWorkspace = async (filePaths: string[], cwd: string): Promise<string> => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'cody-benchmark-'))
    for (const file of filePaths) {
        await copyFileToDir(cwd, file, tempDir)
    }

    // Add any workspace fixture files
    await cp(TEST_WORKSPACE_PATH, tempDir, { recursive: true })

    // Create a Git repo and commit the copied files. This will give us a useful way to compare any future changes.
    await exec('git init --quiet', { cwd: tempDir })
    await exec('git add --all', { cwd: tempDir })
    await exec('git commit -m "init"', { cwd: tempDir, env: commitSignatureEnv })

    return tempDir
}

export interface DatasetConfig {
    entryFile: string
    openFiles: string[]
    closedFiles: string[]
    solutionFile: string
    testFile: string
    testCommand: string
}

export function parseEvaluationConfig(path: string): DatasetConfig {
    try {
        const file = readFileSync(path, 'utf8')
        const config = JSON.parse(file) as DatasetConfig
        return config
    } catch (error) {
        console.error(`Error parsing dataset config file ${path}: ${error}`)
        throw error
    }
}

export const assertEnv = (key: string): string => {
    const env = process.env[key]

    if (!env) {
        throw new Error(`${key} is required.`)
    }

    return env
}

export interface CompletionResult {
    completed: boolean
    timeToCompletion?: number
}

const COMPLETION_FILE = 'completion.json'
export const readCompletionResult = (dir: string): CompletionResult => {
    const filePath = path.join(dir, COMPLETION_FILE)
    try {
        const file = readFileSync(filePath, 'utf8')
        const config = JSON.parse(file) as CompletionResult
        return config
    } catch (error) {
        console.error(`Error parsing completion result file ${filePath}: ${error}`)
        throw error
    }
}
export const writeCompletionResult = (dir: string, result: CompletionResult): void => {
    const filePath = path.join(dir, COMPLETION_FILE)
    return writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8')
}

export interface BenchmarkResult extends CompletionResult {
    // TODO: Remove NO_CHANGE
    testOutcome?: CaseStatus
    workspacePath: string
}

export interface BenchmarkOutput {
    [testId: string]: {
        [extensionId: string]: BenchmarkResult
    }
}
export const readBenchmarkSuiteResults = (path: string): BenchmarkOutput => {
    const existingResults = existsSync(path)

    if (existingResults) {
        try {
            const fileContents = readFileSync(path, 'utf8')
            const config = JSON.parse(fileContents) as BenchmarkOutput
            return config
        } catch (error) {
            console.error(`Error reading benchmark results file ${path}: ${error}`)
            throw error
        }
    }

    return {}
}

interface WriteBenchmarkResult {
    path: string
    testId: string
    extensionId: string
    result: BenchmarkResult
}
export const writeBenchmarkResult = ({ path, testId, extensionId, result }: WriteBenchmarkResult): void => {
    const existingOutput = readBenchmarkSuiteResults(path)

    return writeFileSync(
        path,
        JSON.stringify(
            {
                ...existingOutput,
                [testId]: {
                    ...existingOutput[testId],
                    [extensionId]: result,
                },
            },
            null,
            2
        ),
        'utf-8'
    )
}
