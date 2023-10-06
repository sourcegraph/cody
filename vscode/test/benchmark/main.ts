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
    EXTENSION_TEST_PATH,
    RESULTS_PATH,
    VSCODE_CODY_ROOT,
} from './constants'
import { BENCHMARK_COMPARE_WITH, BENCHMARK_COPILOT_TOKEN, BENCHMARK_DATASET } from './env'
import { CaseStatus, testCompletionResult } from './evaluate-test-case'
import {
    BenchmarkOutput,
    BenchmarkResult,
    copyFileToDir,
    createTemporaryWorkspace,
    parseEvaluationConfig,
    readBenchmarkSuiteResults,
    readCompletionResult,
    writeBenchmarkResult,
} from './utils'

const glob = promisify(_glob)
const exec = promisify(_exec)

function calculateTimeToCompletions(
    data: BenchmarkOutput,
    extensionId: string
): { averageTimeToCompletion: number; medianTimeToCompletion: number } {
    // 1. Gather latencies for given extension ID
    const timesToCompletion: number[] = []
    for (const test of Object.values(data)) {
        const extensionData = test[extensionId]
        if (extensionData.completed && typeof extensionData.timeToCompletion === 'number') {
            timesToCompletion.push(extensionData.timeToCompletion)
        }
    }

    // 2. Calculate average latency
    const averageTimeToCompletion = timesToCompletion.reduce((a, b) => a + b, 0) / timesToCompletion.length

    // 3. Determine median latency
    timesToCompletion.sort((a, b) => a - b)
    const mid = Math.floor(timesToCompletion.length / 2)
    const medianTimeToCompletion =
        timesToCompletion.length % 2 === 0
            ? (timesToCompletion[mid - 1] + timesToCompletion[mid]) / 2
            : timesToCompletion[mid]

    return { averageTimeToCompletion, medianTimeToCompletion }
}

export async function start(): Promise<void> {
    const datasetPath = path.resolve(VSCODE_CODY_ROOT, BENCHMARK_DATASET)
    const benchmarkCases = await glob(path.join(datasetPath, '**/*config.json'))
    if (benchmarkCases.length === 0) {
        throw new Error(`No benchmark cases found inside ${datasetPath}`)
    }

    const extensionDirArg = `--extensions-dir=${mkdtempSync(path.join(tmpdir(), 'benchmark-evaluation-'))}`
    const userDataDirArg = `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'benchmark-evaluation-'))}`

    const extensionsToBenchmark = [CODY_EXTENSION_ID]
    if (BENCHMARK_COMPARE_WITH) {
        extensionsToBenchmark.push(BENCHMARK_COMPARE_WITH)
    }

    const resultsPath = path.join(RESULTS_PATH, `results-${Date.now()}.json`)

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
                    'Running VS Code with `--log=critical` to improve benchmark output. Adjust this arg for easier debugging.'
                )
            )

            for (const benchmarkConfig of benchmarkCases) {
                const benchmarkDir = path.dirname(benchmarkConfig)
                const {
                    entryFile,
                    testCommand,
                    openFiles = [],
                    closedFiles = [],
                    solutionFile,
                    testFile,
                } = parseEvaluationConfig(benchmarkConfig)

                // Copy the entry file into a temporary Git directory
                // This gives us an isolated place where we can allow Cody to make changes, and inspect them later
                const additionalFiles = [...new Set([...openFiles, ...closedFiles])]
                const benchmarkWorkspace = await createTemporaryWorkspace([entryFile, ...additionalFiles], benchmarkDir)

                const extensionTestsEnv: { [key: string]: string } = {
                    BENCHMARK_EXTENSION_ID: extension,
                    BENCHMARK_CONFIG_FILE: benchmarkConfig,
                    BENCHMARK_WORKSPACE: benchmarkWorkspace,
                }

                if (extension === COPILOT_EXTENSION_ID && BENCHMARK_COPILOT_TOKEN) {
                    // Support programmatically signing into Copilot via a token
                    // This is a bit of a hack to give us some way of running Copilot programmatically
                    // We should look into a better way to do this.
                    extensionTestsEnv.CODESPACES = 'true'
                    extensionTestsEnv.GITHUB_TOKEN = BENCHMARK_COPILOT_TOKEN
                }

                await runTests({
                    vscodeExecutablePath,
                    extensionDevelopmentPath: VSCODE_CODY_ROOT,
                    extensionTestsPath: EXTENSION_TEST_PATH,
                    launchArgs: [benchmarkWorkspace, extensionDirArg, userDataDirArg, '--log=critical'],
                    extensionTestsEnv,
                })

                if (solutionFile) {
                    // Copy the solution file. This is primarily so we can compare the generation vs the solution.
                    // In the future we may also want to produce edit similarity (ES) and exact match (EM) metrics for further inspection.
                    await copyFileToDir(benchmarkDir, solutionFile, benchmarkWorkspace)
                }

                // Extract the completion result from the test run
                const benchmarkResult: BenchmarkResult = {
                    ...readCompletionResult(benchmarkWorkspace),
                    workspacePath: benchmarkWorkspace,
                }

                if (benchmarkResult.completed) {
                    if (testFile) {
                        // Copy the test file. We do this after the evaluation is completed to ensure there is no chance it is included as context.
                        await copyFileToDir(benchmarkDir, testFile, benchmarkWorkspace)
                    }

                    // Run the test file against the generated completion
                    benchmarkResult.testOutcome = await testCompletionResult(testCommand, benchmarkWorkspace)
                }

                const testId = `${BENCHMARK_DATASET} - ${path.basename(benchmarkDir)}`

                // Write to result file so we can parse it in the final summary
                writeBenchmarkResult({
                    path: resultsPath,
                    testId,
                    extensionId: extension,
                    result: benchmarkResult,
                })

                const diff = await exec(`git diff --color=always -U0 ${entryFile} | tail -n +5`, {
                    cwd: benchmarkWorkspace,
                })

                // Also log summary to console for immediate easy viewing
                const testEmoji =
                    benchmarkResult.testOutcome === CaseStatus.PASS
                        ? '🟢'
                        : benchmarkResult.testOutcome === CaseStatus.FAIL
                        ? '🔴'
                        : '🟡'
                console.log(
                    `${testEmoji} ${testId}:\n`,
                    `Completion: ${
                        benchmarkResult.completed
                            ? chalk.green(`Generated in ${benchmarkResult.timeToCompletion}ms`)
                            : chalk.yellow('Completion did not generate')
                    }\n`,
                    `Evaluation: ${
                        benchmarkResult.testOutcome === CaseStatus.PASS
                            ? chalk.green('PASS')
                            : benchmarkResult.testOutcome === CaseStatus.FAIL
                            ? chalk.red('FAIL')
                            : chalk.gray('IGNORED')
                    }\n`,
                    `Workspace: ${benchmarkResult.workspacePath}\n`,
                    `Diff:\n${diff.stdout}\n`
                )
            }
        }
    } catch (error) {
        console.error('Failed to run tests:', error)
        process.exit(1)
    }

    const finalResults = readBenchmarkSuiteResults(resultsPath)

    // Log a final summary count for each extension
    for (const extension of extensionsToBenchmark) {
        const { passCount, failCount, noCompletionCount } = Object.values(finalResults).reduce(
            (acc, result) => {
                if (result[extension].testOutcome === CaseStatus.PASS) {
                    acc.passCount++
                } else if (result[extension].testOutcome === CaseStatus.FAIL) {
                    acc.failCount++
                } else {
                    acc.noCompletionCount++
                }
                return acc
            },
            {
                passCount: 0,
                failCount: 0,
                noCompletionCount: 0,
            }
        )

        const passRate = (passCount / (passCount + failCount + noCompletionCount)) * 100
        const passRateExcludingNoCompletion = (passCount / (passCount + failCount)) * 100
        const { averageTimeToCompletion, medianTimeToCompletion } = calculateTimeToCompletions(finalResults, extension)

        console.log(`${extension}:`)
        console.log(chalk.green(`Pass: ${passCount}`))
        console.log(chalk.red(`Fail: ${failCount}`))
        console.log(chalk.yellow(`No Completion: ${noCompletionCount}`))
        console.log(chalk.cyanBright(`Average Time to Completion*: ${averageTimeToCompletion.toFixed(0)}ms`))
        console.log(chalk.cyanBright(`Median Time to Completion*: ${medianTimeToCompletion.toFixed(0)}ms`))
        console.log(chalk.blue(`Pass Rate: ${passRate.toFixed(2)}%`))
        console.log(chalk.blue(`Adjusted Pass Rate**: ${passRateExcludingNoCompletion.toFixed(2)}%\n`))
    }

    console.log(
        chalk.gray(
            '* Time to Completion is the time difference between when the completion request is triggered, to when the completion is accepted back into the document.'
        )
    )
    console.log(chalk.gray('** Adjusted Pass Rate excludes cases where no completion was generated.'))

    console.log(`\nFull results: ${resultsPath}`)
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
start()
