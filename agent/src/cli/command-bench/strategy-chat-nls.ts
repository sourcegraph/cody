import path from 'node:path'
import { graphqlClient, isError } from '@sourcegraph/cody-shared'
import { escapeNLSQuery } from '../../../../vscode/src/chat/chat-view/handlers/SearchHandler'
import { version } from '../../../package.json'
import type { CodyBenchOptions } from './command-bench'
import {
    type EvalContextItem,
    type Example,
    type ExampleOutput,
    readExamplesFromCSV,
    writeExamplesToCSV,
    writeYAMLMetadata,
} from './strategy-chat-context-types'

export async function evaluateNLSStrategy(options: CodyBenchOptions): Promise<void> {
    const inputFilename = options.fixture.customConfiguration?.['cody-bench.chatContext.inputFile']
    if (options.insecureTls) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    }
    if (!inputFilename) {
        throw new Error(
            'Missing cody-bench.chatContext.inputFile. To fix this problem, add "customConfiguration": { "cody-bench.chatContext.inputFile": "examples.csv" } to the cody-bench JSON config.'
        )
    }
    const inputBasename = path.basename(inputFilename).replace(/\.csv$/, '')

    const siteVersion = await graphqlClient.getSiteVersion()
    if (isError(siteVersion)) {
        throw siteVersion
    }
    const userInfo = await graphqlClient.getCurrentUserInfo()
    if (isError(userInfo)) {
        throw userInfo
    }
    const evaluatedFeatureFlags = await graphqlClient.getEvaluatedFeatureFlags()
    if (isError(evaluatedFeatureFlags)) {
        throw evaluatedFeatureFlags
    }
    const shortSiteVersion = siteVersion.match(/-[0-9a-f]{7,40}$/)
        ? siteVersion.match(/-([0-9a-f]{7,40})$/)?.[1]
        : siteVersion
    const currentTimestamp = new Date().toISOString()
    const date = currentTimestamp.split('T')[0]

    const outputBase = `${inputBasename}__${date}__${shortSiteVersion}`
    const outputCSVFilename = `${outputBase}.csv`
    const outputYAMLFilename = `${outputBase}.yaml`

    const inputFile = path.join(options.workspace, inputFilename)
    const outputCSVFile = path.join(options.snapshotDirectory, outputCSVFilename)
    const outputYAMLFile = path.join(options.snapshotDirectory, outputYAMLFilename)

    const examples = await readExamplesFromCSV(inputFile)

    const outputs = await runNLSSearch(examples)
    const codyClientVersion = process.env.CODY_COMMIT ?? version
    await writeExamplesToCSV(outputCSVFile, outputs)
    await writeYAMLMetadata(outputYAMLFile, {
        evaluatedAt: currentTimestamp,
        codyClientVersion,
        siteUserMetadata: {
            url: options.srcEndpoint,
            sourcegraphVersion: siteVersion,
            username: userInfo?.username ?? '[none]',
            userId: userInfo?.id ?? '[none]',
            evaluatedFeatureFlags,
        },
    })
}

async function runNLSSearch(examples: Example[]): Promise<ExampleOutput[]> {
    const exampleOutputs: ExampleOutput[] = []

    for (const example of examples) {
        const { targetRepoRevs, query } = example
        const repoNames = targetRepoRevs.map(repoRev => repoRev.repoName)
        const repoFilter = 'repo:' + repoNames.join('|')

        const fullQuery = `${repoFilter} content:"${escapeNLSQuery(query)}"`
        const resultsResp = await graphqlClient.nlsSearchQuery({
            query: fullQuery,
        })

        if (isError(resultsResp)) {
            throw new Error(
                `NLS search failed for repos [${repoNames.join(
                    ','
                )}] and query "${query}": ${resultsResp}`
            )
        }

        const results = resultsResp.results.results
        const actualContext: EvalContextItem[] = []
        for (const result of results) {
            if (result.__typename === 'unknown') {
                throw new Error('NLS search returned a result with unknown type')
            }

            const chunkMatches = result.chunkMatches ?? []
            const symbols = result.symbols ?? []
            let startLine = 0
            let endLine = 0
            let content = ''

            // Convert the chunk and symbol matches to the benchmark result format. We add 1 to all line numbers
            // because the eval annotations use 1-based line indexing.
            if (chunkMatches.length > 0) {
                startLine = chunkMatches[0].contentStart.line + 1
                endLine = startLine + chunkMatches[0].content.split('\n').length
                content = chunkMatches[0].content
            } else if (symbols.length > 0) {
                startLine = symbols[0].location.range.start.line + 1
                // Make sure the match is at least 3 lines long, because the eval framework requires an overlap of 3
                // for a match to be 'correct'. This is a bit arbitrary, but is necessary until we refine the evals.
                endLine = startLine + 3
                content = symbols[0].name
            }

            actualContext.push({
                repoName: result.repository.name.replace(/^github\.com\//, ''),
                path: result.file.path,
                startLine: startLine,
                endLine: endLine,
                content: content,
                retriever: 'default',
            })
        }
        exampleOutputs.push({
            ...example,
            actualContext,
        })
    }

    return exampleOutputs
}
