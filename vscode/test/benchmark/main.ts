import { exec as _exec, spawnSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'
import { promisify } from 'util'

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from '@vscode/test-electron'
import _glob from 'glob'

import { BENCHMARK_COMPARE_WITH, BENCHMARK_DATASET } from './config'
import { CODY_EXTENSION_ID, DATASETS_PATH, VSCODE_CODY_ROOT } from './constants'
import { parseEvaluationConfig } from './datasets'
import { CaseStatus, copyFileToWorkspace, createTemporaryWorkspace, testCompletionResult } from './evaluate-test-case'

const glob = promisify(_glob)
const exec = promisify(_exec)

export async function start(): Promise<void> {
    // The path to the test runner script, passed to --extensionTestsPath.
    const EXTENSION_TEST_PATH = path.resolve(VSCODE_CODY_ROOT, 'dist', 'tsc', 'test', 'benchmark', 'index')

    // We override the runTest default extension directory as the `code` CLI does not provide an easy way to enable only a set of extensions
    const extensionDirArg = `--extensions-dir=${mkdtempSync(path.join(tmpdir(), 'benchmark-extensions'))}`

    const extensionsToBenchmark = [CODY_EXTENSION_ID]
    if (BENCHMARK_COMPARE_WITH) {
        extensionsToBenchmark.push(BENCHMARK_COMPARE_WITH)
    }

    try {
        // TODO: Use 1.80 for improved auth?
        const vscodeExecutablePath = await downloadAndUnzipVSCode('1.79.1')
        for (const extension of extensionsToBenchmark) {
            if (extension !== CODY_EXTENSION_ID) {
                // Not the local Cody extension, lets download from the marketplace
                const [cli] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath)
                spawnSync(cli, ['--install-extension', extension, extensionDirArg], {
                    encoding: 'utf-8',
                    stdio: 'inherit',
                })
            }

            const datasetPath = path.resolve(DATASETS_PATH, BENCHMARK_DATASET)
            const benchmarkCases = await glob(path.join(datasetPath, '**/*/config.json'))
            if (benchmarkCases.length === 0) {
                throw new Error(`No benchmark cases found inside ${datasetPath}`)
            }

            for (const benchmarkConfig of benchmarkCases) {
                const benchmarkDir = path.dirname(benchmarkConfig)
                const id = path.basename(benchmarkDir)
                const evalCaseConfig = parseEvaluationConfig(benchmarkConfig)
                // Copy the entry file into a temporary Git directory
                // This gives us an isolated place where we can allow Cody to make changes, and inspect them later
                const otherFiles = [...new Set([...evalCaseConfig.openFiles, ...evalCaseConfig.additionalFiles])]
                const tempWorkspace = await createTemporaryWorkspace(
                    [evalCaseConfig.entryFile, ...otherFiles],
                    benchmarkDir
                )

                await runTests({
                    vscodeExecutablePath,
                    extensionDevelopmentPath: VSCODE_CODY_ROOT,
                    extensionTestsPath: EXTENSION_TEST_PATH,
                    launchArgs: [tempWorkspace, extensionDirArg, '--log=off'],
                    extensionTestsEnv: {
                        BENCHMARK_EXTENSION_ID: extension,
                        BENCHMARK_CONFIG_FILE: benchmarkConfig,
                        BENCHMARK_WORKSPACE: tempWorkspace,
                    },
                })

                // Copy the test file. We do this after the evaluation is completed to ensure there is no chance it is included as context.    await copyFileToWorkspace()
                await copyFileToWorkspace(tempWorkspace, evalCaseConfig.testFile, benchmarkDir)

                // Run the test file against the generated completion
                const testOutcome = await testCompletionResult(
                    evalCaseConfig.testFile,
                    evalCaseConfig.testCommand,
                    tempWorkspace
                )

                // Copy the solution file. This is primarily so we can compare the generation vs the solution.
                // In the future we may also want to produce edit similarity (ES) and exact match (EM) metrics for further inspection.
                await copyFileToWorkspace(tempWorkspace, evalCaseConfig.solutionFile, benchmarkDir)

                if (testOutcome === CaseStatus.FAIL) {
                    console.log(`🔴 FAIL ${id} - ${tempWorkspace}`)
                    // Also print the diff for quick evaluation
                    const diff = await exec(`git diff --color=always -U0 ${evalCaseConfig.entryFile} | tail -n +5`, {
                        cwd: tempWorkspace,
                    })
                    console.log(diff.stdout)
                } else {
                    console.log(`🟢 PASS ${id} - ${tempWorkspace}`)
                }
            }
        }
    } catch (error) {
        console.error('Failed to run tests:', error)
        process.exit(1)
    }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
start()
