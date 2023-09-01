import fs from 'fs/promises'

import chalk from 'chalk'

import { ChatMessage } from '@sourcegraph/cody-shared'
import { createClient, Transcript } from '@sourcegraph/cody-shared/src/chat/client'
import { NoopEditor } from '@sourcegraph/cody-shared/src/editor'
import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'

import { CLIOptions, program } from '.'
import { factCheck } from './fact-check'
import { failFastIfAzureEnvVarsNotSet, llmJudge } from './llm-judge'
import { TestCase, testCases } from './test-cases'
import { aggregateResults, AggregateTestResults, logAggregateResults, TestResult } from './test-results'

async function runTestCase(testCase: TestCase, provider: CLIOptions['provider']): Promise<TestResult | Error> {
    let latestMessage: ChatMessage | null = { text: '', speaker: 'assistant' }
    let transcript: Transcript | null = new Transcript()
    const client = await createClient({
        config: {
            serverEndpoint: process.env.SRC_ENDPOINT ?? '',
            accessToken: process.env.SRC_ACCESS_TOKEN ?? '',
            codebase: testCase.codebase,
            useContext: testCase.context,
            customHeaders: {},
            experimentalLocalSymbols: false,
        },
        setMessageInProgress: message => {
            latestMessage = message
        },
        setTranscript: transcript_ => {
            transcript = transcript_
        },
        editor: new NoopEditor(),
        createCompletionsClient: (...args) => new SourcegraphNodeCompletionsClient(...args),
    })
    if (!client) {
        return new Error('Failed to create client')
    }

    const testTranscript: TestResult['transcript'] = []
    for (const interaction of testCase.transcript) {
        await client.submitMessage(interaction.question)

        // Wait for the answer to stream back.
        await new Promise<void>(resolve => {
            const interval = setInterval(() => {
                if (latestMessage === null) {
                    // Reset latest message for next interaction.
                    latestMessage = { text: '', speaker: 'assistant' }
                    clearInterval(interval)
                    resolve()
                }
            }, 250)
        })

        const answer = transcript?.getLastInteraction()?.getAssistantMessage()?.text
        if (!answer) {
            return new Error(`No answer provided for question: ${interaction.question}`)
        }

        const llmJudgement = await llmJudge(
            provider,
            // Use `answerSummary` instead of `answer` for transcript history since it might contain wrong information that will impact the judgement.
            // We want to judge the latest answer assuming the transcript up to this point is correct.
            testTranscript.map(interaction => ({ question: interaction.question, answer: interaction.answerSummary })),
            interaction.question,
            interaction.answerSummary,
            answer
        )
        const factCheckResult = await factCheck(testCase.codebase, interaction.facts, answer)

        testTranscript.push({ ...interaction, answer, ...llmJudgement, ...factCheckResult })
    }
    return { ...testCase, transcript: testTranscript }
}

function getRunnableTestCases(options: CLIOptions): TestCase[] {
    return testCases.filter(
        testCase => !options.label || testCase.label.toLowerCase().includes(options.label.toLowerCase())
    )
}

async function runTestCases(options: CLIOptions): Promise<TestResult[]> {
    const runnableTestCases = getRunnableTestCases(options)

    const testResults = []
    for (const testCase of runnableTestCases) {
        console.log(
            `Testing (${testResults.length + 1}/${runnableTestCases.length}):`,
            chalk.blueBright(testCase.label, `(${testCase.codebase})`)
        )
        const testResult = await runTestCase(testCase, options.provider)
        if (testResult instanceof Error) {
            console.error('Error running the test:', testResult.message)
            continue
        }
        logAggregateResults(aggregateResults([testResult]))
        console.log()
        testResults.push(testResult)
    }

    return testResults
}

export async function run(): Promise<void> {
    const options = program.opts<CLIOptions>()

    if (options.provider === 'azure') {
        failFastIfAzureEnvVarsNotSet() // Fail fast if Azure env vars not set.
    }

    const runs: TestResult[][] = []
    const aggregateRunsResults: AggregateTestResults[] = []
    for (let runCounter = 0; runCounter < options.runs; runCounter++) {
        console.log(chalk.bgBlueBright(`Run ${runCounter + 1} of ${options.runs}`), '\n')
        const run = await runTestCases(options)
        runs.push(run)

        const aggregateRunResults = aggregateResults(run)
        aggregateRunsResults.push(aggregateRunResults)

        console.log(`Run ${runCounter + 1} of ${options.runs} summary:`)
        logAggregateResults(aggregateRunResults)
        console.log()
    }

    if (runs.length > 1) {
        console.log('Summary across all runs:')
        logAggregateResults(aggregateResults(runs.flat()))
    }

    if (options.output) {
        await fs.writeFile(options.output, JSON.stringify({ runs }, null, 2))
    }
}
