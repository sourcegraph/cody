import path from 'node:path'
import { PromptString, graphqlClient, isError } from '@sourcegraph/cody-shared'
import { SourcegraphNodeCompletionsClient } from '../../../../vscode/src/completions/nodeClient'
import { rewriteKeywordQuery } from '../../../../vscode/src/local-context/rewrite-keyword-query'
import { version } from '../../../package.json'
import type { RpcMessageHandler } from '../../jsonrpc-alias'
import type { CodyBenchOptions } from './command-bench'
import {
    type ClientOptions,
    type EvalContextItem,
    type Example,
    type ExampleOutput,
    readExamplesFromCSV,
    writeExamplesToCSV,
    writeYAMLMetadata,
} from './strategy-chat-context-types'

export async function evaluateChatContextStrategy(
    client: RpcMessageHandler,
    options: CodyBenchOptions
): Promise<void> {
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

    const clientOptions: ClientOptions = options.fixture.customConfiguration?.[
        'cody-bench.chatContext.clientOptions'
    ] ?? {
        rewrite: false,
        codeResultsCount: 15,
        textResultsCount: 5,
    }

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

    const { examples, ignoredRecords } = await readExamplesFromCSV(inputFile)

    if (ignoredRecords.length > 0) {
        console.log(`⚠ ignoring ${ignoredRecords.length} malformed rows`)
    }

    const outputs = await runContextCommand(clientOptions, examples)
    const codyClientVersion = process.env.CODY_COMMIT ?? version
    await writeExamplesToCSV(outputCSVFile, outputs)
    await writeYAMLMetadata(outputYAMLFile, {
        evaluatedAt: currentTimestamp,
        clientOptions,
        codyClientVersion,
        siteUserMetadata: {
            url: options.srcEndpoint,
            sourcegraphVersion: siteVersion,
            username: userInfo?.username ?? '[none]',
            userId: userInfo?.id ?? '[none]',
            evaluatedFeatureFlags,
        }
    })
}

async function runContextCommand(
    clientOpts: ClientOptions,
    examples: Example[]
): Promise<ExampleOutput[]> {
    const completionsClient = new SourcegraphNodeCompletionsClient()
    const exampleOutputs: ExampleOutput[] = []

    for (const example of examples) {
        const { targetRepoRevs, query: origQuery } = example
        const repoNames = targetRepoRevs.map(repoRev => repoRev.repoName)
        const repoIDNames = await graphqlClient.getRepoIds(repoNames, repoNames.length + 10)
        if (isError(repoIDNames)) {
            throw new Error(`getRepoIds failed for [${repoNames.join(',')}]: ${repoIDNames}`)
        }
        if (repoIDNames.length !== repoNames.length) {
            throw new Error(
                `repoIDs.length (${repoIDNames.length}) !== repoNames.length (${
                    repoNames.length
                }), repoNames were (${repoNames.join(', ')})`
            )
        }
        const repoIDs = repoIDNames.map(repoIDName => repoIDName.id)

        let query = origQuery
        if (clientOpts.rewrite) {
            query = await rewriteKeywordQuery(
                completionsClient,
                PromptString.unsafe_fromUserQuery(origQuery)
            )
        }

        const resultsResp = await graphqlClient.contextSearchAlternatives({
            repoIDs,
            query,
            filePatterns: [],
            codeResultsCount: clientOpts.codeResultsCount,
            textResultsCount: clientOpts.textResultsCount,
        })

        if (isError(resultsResp)) {
            throw new Error(`contextSearch failed for [${repoNames.join(',')}]: ${resultsResp}`)
        }
        if (resultsResp === null) {
            throw new Error(`contextSearch failed for [${repoNames.join(',')}]: null results`)
        }

        const results = resultsResp ?? []
        const actualContext: EvalContextItem[] = []
        for (const contextList of results) {
            actualContext.push(...contextList.contextList.map(result => ({
                repoName: result.repoName,
                path: result.path,
                startLine: result.startLine,
                endLine: result.endLine,
                content: result.content,
                retriever: contextList.name,
            })))
        }
        exampleOutputs.push({
            ...example,
            actualContext,
        })
    }

    return exampleOutputs
}
