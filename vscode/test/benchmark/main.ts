import { exec as _exec, spawnSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'
import { promisify } from 'util'

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from '@vscode/test-electron'
import _glob from 'glob'

import { CODY_EXTENSION_ID, DATASETS_PATH, EXTENSION_TEST_PATH, VSCODE_CODY_ROOT } from './constants'
import { CaseStatus, testCompletionResult } from './evaluate-test-case'
import { copyFileToWorkspace, createTemporaryWorkspace, parseEvaluationConfig } from './utils'

const glob = promisify(_glob)
const exec = promisify(_exec)

interface BenchmarkOutput {
    [testId: string]: {
        [extensionId: string]: string
    }
}

export async function start(): Promise<void> {
    const benchmarkDataset = process.env.BENCHMARK_DATASET || DATASETS_PATH
    const datasetPath = path.resolve(VSCODE_CODY_ROOT, benchmarkDataset)
    const benchmarkCases = await glob(path.join(datasetPath, '**/*config.json'))
    if (benchmarkCases.length === 0) {
        throw new Error(`No benchmark cases found inside ${datasetPath}`)
    }

    const extensionDirArg = `--extensions-dir=${mkdtempSync(path.join(tmpdir(), 'benchmark-evaluation-'))}`
    const userDataDirArg = `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'benchmark-evaluation-'))}`

    const extensionsToBenchmark = [CODY_EXTENSION_ID]
    const benchmarkCompareWith = process.env.BENCHMARK_COMPARE_WITH
    if (benchmarkCompareWith) {
        extensionsToBenchmark.push(benchmarkCompareWith)
    }

    const results: BenchmarkOutput = {}

    try {
        const vscodeExecutablePath = await downloadAndUnzipVSCode('stable')

        for (const extension of extensionsToBenchmark) {
            if (extension !== CODY_EXTENSION_ID) {
                // Not the local Cody extension, lets download from the marketplace
                const [cli] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath)
                spawnSync(cli, ['--install-extension', extension, extensionDirArg], {
                    encoding: 'utf-8',
                    stdio: 'inherit',
                })
            }

            for (const benchmarkConfig of benchmarkCases) {
                const benchmarkDir = path.dirname(benchmarkConfig)
                const testId = `${benchmarkDataset}/${path.basename(benchmarkDir)}`
                const evalCaseConfig = parseEvaluationConfig(benchmarkConfig)

                // Copy the entry file into a temporary Git directory
                // This gives us an isolated place where we can allow Cody to make changes, and inspect them later
                const additionalFiles = [...new Set([...evalCaseConfig.openFiles, ...evalCaseConfig.closedFiles])]
                const benchmarkWorkspace = await createTemporaryWorkspace(
                    [evalCaseConfig.entryFile, ...additionalFiles],
                    benchmarkDir
                )

                await runTests({
                    vscodeExecutablePath,
                    extensionDevelopmentPath: VSCODE_CODY_ROOT,
                    extensionTestsPath: EXTENSION_TEST_PATH,
                    launchArgs: [benchmarkWorkspace, extensionDirArg, userDataDirArg, '--log=off'],
                    extensionTestsEnv: {
                        BENCHMARK_EXTENSION_ID: extension,
                        BENCHMARK_CONFIG_FILE: benchmarkConfig,
                        BENCHMARK_WORKSPACE: benchmarkWorkspace,
                    },
                })

                // Copy the test file. We do this after the evaluation is completed to ensure there is no chance it is included as context.
                await copyFileToWorkspace(benchmarkWorkspace, evalCaseConfig.testFile, benchmarkDir)

                // Run the test file against the generated completion
                const testOutcome = await testCompletionResult(
                    evalCaseConfig.testFile,
                    evalCaseConfig.testCommand,
                    benchmarkWorkspace
                )

                // Copy the solution file. This is primarily so we can compare the generation vs the solution.
                // In the future we may also want to produce edit similarity (ES) and exact match (EM) metrics for further inspection.
                await copyFileToWorkspace(benchmarkWorkspace, evalCaseConfig.solutionFile, benchmarkDir)

                const testResult =
                    testOutcome === CaseStatus.FAIL ? `🔴 - ${benchmarkWorkspace}` : `🟢 - ${benchmarkWorkspace}`
                console.log(testResult)

                // Log a pretty Git diff, omitting the patch header
                const diff = await exec(`git diff --color=always -U0 ${evalCaseConfig.entryFile} | tail -n +5`, {
                    cwd: benchmarkWorkspace,
                })
                console.log(diff.stdout)

                results[testId] = {
                    ...results[testId],
                    [extension]: testResult,
                }
            }
        }
    } catch (error) {
        console.error('Failed to run tests:', error)
        process.exit(1)
    }

    // Print final results in a table split by extension ID.
    console.table(results)
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
start()
