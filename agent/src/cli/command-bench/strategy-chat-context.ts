import path from 'node:path'
import { PromptString, graphqlClient, isError } from '@sourcegraph/cody-shared'
import { SourcegraphNodeCompletionsClient } from '../../../../vscode/src/completions/nodeClient'
import { rewriteKeywordQuery } from '../../../../vscode/src/local-context/rewrite-keyword-query'
import { version } from '../../../package.json'
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

export async function evaluateChatContextStrategy(options: CodyBenchOptions): Promise<void> {
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

    const examples = await readExamplesFromCSV(inputFile)

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
        },
    })
}

async function runContextCommand(
    clientOpts: ClientOptions,
    examples: Example[]
): Promise<ExampleOutput[]> {
    const completionsClient = new SourcegraphNodeCompletionsClient()
    const exampleOutputs: ExampleOutput[] = []
    const repoIDNamesCache = new Map<string, string>()

    for (const example of examples) {
        const start = Date.now()
        const { targetRepoRevs, query: origQuery } = example
        console.log({ query: example.query })
        const repoNames = targetRepoRevs.map(repoRev => repoRev.repoName)

        // Get repo IDs from cache or fetch them
        const repoIDNames: { id: string; name: string }[] = []
        const uncachedRepoNames: string[] = []
        for (const repoName of repoNames) {
            const cachedId = repoIDNamesCache.get(repoName)
            if (cachedId) {
                repoIDNames.push({ id: cachedId, name: repoName })
            } else {
                uncachedRepoNames.push(repoName)
            }
        }

        if (uncachedRepoNames.length > 0) {
            const fetchedRepoIDNames = await graphqlClient.getRepoIds(
                uncachedRepoNames,
                uncachedRepoNames.length + 10
            )
            console.log('repo id names', Date.now() - start)
            if (isError(fetchedRepoIDNames)) {
                throw new Error(
                    `getRepoIds failed for [${uncachedRepoNames.join(',')}]: ${fetchedRepoIDNames}`
                )
            }
            // Add fetched IDs to cache and results
            for (const repo of fetchedRepoIDNames) {
                repoIDNamesCache.set(repo.name, repo.id)
                repoIDNames.push(repo)
            }
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
            console.log('rewrote keyword query', Date.now() - start)
        }

        const resultsResp = await graphqlClient.contextSearchEvalDebug({
            repoIDs,
            query,
            filePatterns: [],
            codeResultsCount: clientOpts.codeResultsCount,
            textResultsCount: clientOpts.textResultsCount,
        })
        console.log('fetched context', Date.now() - start)

        if (isError(resultsResp)) {
            throw new Error(
                `contextSearch failed for repos [${repoNames.join(
                    ','
                )}] and query "${query}": ${resultsResp}`
            )
        }
        if (resultsResp === null) {
            throw new Error(
                `contextSearch failed for repos [${repoNames.join(
                    ','
                )}] and query "${query}": null results`
            )
        }

        const results = resultsResp ?? []
        const actualContext: EvalContextItem[] = []
        for (const contextList of results) {
            actualContext.push(
                ...contextList.contextList.map(result => ({
                    repoName: result.repoName.replace(/^github\.com\//, ''),
                    path: result.path,
                    startLine: result.startLine,
                    endLine: result.endLine,
                    content: result.content,
                    retriever: contextList.name,
                }))
            )
        }
        exampleOutputs.push({
            ...example,
            actualContext,
        })
    }
    return exampleOutputs
}
