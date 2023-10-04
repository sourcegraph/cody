import { exec as _exec, spawnSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'
import { promisify } from 'util'

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from '@vscode/test-electron'
import chalk from 'chalk'
import _glob from 'glob'

import {
    CODY_EXTENSION_ID,
    COPILOT_EXTENSION_ID,
    DATASETS_PATH,
    EXTENSION_TEST_PATH,
    VSCODE_CODY_ROOT,
} from './constants'
import { CaseStatus, testCompletionResult } from './evaluate-test-case'
import { copyFileToWorkspace, createTemporaryWorkspace, hasGitChanges, parseEvaluationConfig } from './utils'

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

            console.log(
                chalk.yellow(
                    'Running VS Code with `--log=error` to improve benchmark output. Remove this arg for debugging.'
                )
            )

            for (const benchmarkConfig of benchmarkCases) {
                const benchmarkDir = path.dirname(benchmarkConfig)
                const evalCaseConfig = parseEvaluationConfig(benchmarkConfig)

                // Copy the entry file into a temporary Git directory
                // This gives us an isolated place where we can allow Cody to make changes, and inspect them later
                const additionalFiles = [...new Set([...evalCaseConfig.openFiles, ...evalCaseConfig.closedFiles])]
                const benchmarkWorkspace = await createTemporaryWorkspace(
                    [evalCaseConfig.entryFile, ...additionalFiles],
                    benchmarkDir
                )

                const extensionTestsEnv: { [key: string]: string } = {
                    BENCHMARK_EXTENSION_ID: extension,
                    BENCHMARK_CONFIG_FILE: benchmarkConfig,
                    BENCHMARK_WORKSPACE: benchmarkWorkspace,
                }

                if (extension === COPILOT_EXTENSION_ID && process.env.BENCHMARK_COPILOT_TOKEN) {
                    // Support programmatically signing into Copilot via a token
                    // This is a bit of a hack to give us some way of running Copilot programmatically
                    // We should look into a better way to do this.
                    extensionTestsEnv.CODESPACES = 'true'
                    extensionTestsEnv.GITHUB_TOKEN = process.env.BENCHMARK_COPILOT_TOKEN
                }

                await runTests({
                    vscodeExecutablePath,
                    extensionDevelopmentPath: VSCODE_CODY_ROOT,
                    extensionTestsPath: EXTENSION_TEST_PATH,
                    launchArgs: [benchmarkWorkspace, extensionDirArg, userDataDirArg, '--log=error'],
                    extensionTestsEnv,
                })

                // Copy the solution file. This is primarily so we can compare the generation vs the solution.
                // In the future we may also want to produce edit similarity (ES) and exact match (EM) metrics for further inspection.
                await copyFileToWorkspace(benchmarkWorkspace, evalCaseConfig.solutionFile, benchmarkDir)

                let testOutcome: CaseStatus

                const hasChanged = await hasGitChanges(evalCaseConfig.entryFile, benchmarkWorkspace)
                if (hasChanged) {
                    // Copy the test file. We do this after the evaluation is completed to ensure there is no chance it is included as context.
                    await copyFileToWorkspace(benchmarkWorkspace, evalCaseConfig.testFile, benchmarkDir)

                    // Run the test file against the generated completion
                    testOutcome = await testCompletionResult(
                        evalCaseConfig.testFile,
                        evalCaseConfig.testCommand,
                        benchmarkWorkspace
                    )
                } else {
                    // If the file has not changed, we should handle it differently and skip running the test.
                    // This will indicate that the extension did not provide any completion, which is an important data point.
                    testOutcome = CaseStatus.NO_CHANGE
                }

                const testEmoji = testOutcome === CaseStatus.PASS ? '🟢' : testOutcome === CaseStatus.FAIL ? '🔴' : '🟡'
                const benchmarkOutput = `${testEmoji} - ${benchmarkWorkspace}`
                console.log(benchmarkOutput)

                // Log a pretty Git diff, omitting the patch header
                const diff = await exec(`git diff --color=always -U0 ${evalCaseConfig.entryFile} | tail -n +5`, {
                    cwd: benchmarkWorkspace,
                })
                console.log(diff.stdout)

                const testId = `${benchmarkDataset} - ${path.basename(benchmarkDir)}`
                results[testId] = {
                    ...results[testId],
                    [extension]: benchmarkOutput,
                }
            }
        }
    } catch (error) {
        console.error('Failed to run tests:', error)
        process.exit(1)
    }

    // This is a pretty rudimentary final output that just spits the results into a table,
    // and does some basic filtering to get final test counts.
    // TODO: Consider the best format for viewing results, HTML file? JSON?
    console.table(results)
    // Log a final summary count for each extension
    for (const extension of extensionsToBenchmark) {
        const { passCount, failCount, noChangeCount } = Object.values(results).reduce(
            (acc, result) => {
                if (result[extension].startsWith('🟢')) {
                    acc.passCount++
                } else if (result[extension].startsWith('🔴')) {
                    acc.failCount++
                } else {
                    acc.noChangeCount++
                }
                return acc
            },
            {
                passCount: 0,
                failCount: 0,
                noChangeCount: 0,
            }
        )

        const passRate = (passCount / (passCount + failCount + noChangeCount)) * 100

        console.log(`\n${extension}:`)
        console.log(chalk.green(`Pass: ${passCount}`))
        console.log(chalk.red(`Fail: ${failCount}`))
        console.log(chalk.yellow(`No Change: ${noChangeCount}`))
        console.log(chalk.blue(`Pass rate: ${passRate.toFixed(2)}%\n`))
    }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
start()
