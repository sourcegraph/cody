import chalk from 'chalk'

import { BenchmarkOutput, readBenchmarkSuiteResults } from './utils'

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

export const summarizeResultsInConsole = (resultsPath: string, extensions: string[]): void => {
    const finalResults = readBenchmarkSuiteResults(resultsPath)

    // Log a final summary count for each extension
    for (const extension of extensions) {
        const { passCount, failCount, noCompletionCount } = Object.values(finalResults).reduce(
            (acc, result) => {
                if (!result[extension].completed) {
                    acc.noCompletionCount++
                } else if (result[extension].testPassed) {
                    acc.passCount++
                } else {
                    acc.failCount++
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
