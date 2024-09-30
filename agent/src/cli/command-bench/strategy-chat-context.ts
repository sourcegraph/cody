import path from 'node:path'
import { graphqlClient, isError } from '@sourcegraph/cody-shared'
import type { RpcMessageHandler } from '../../jsonrpc-alias'
import type { CodyBenchOptions } from './command-bench'
import {
    type EvalContextItem,
    type Example,
    type ExampleOutput,
    contextItemFromString,
    contextItemToString,
    readExamplesFromCSV,
    writeExamplesToCSV,
} from './strategy-chat-context-types'

export async function evaluateChatContextStrategy(
    client: RpcMessageHandler,
    options: CodyBenchOptions
): Promise<void> {
    const inputFilename = options.fixture.customConfiguration?.['cody-bench.chatContext.inputFile']
    if (!inputFilename) {
        throw new Error(
            'Missing cody-bench.chatContext.inputFile. To fix this problem, add "customConfiguration": { "cody-bench.chatContext.inputFile": "examples.csv" } to the cody-bench JSON config.'
        )
    }
    const outputFilename = options.fixture.customConfiguration?.['cody-bench.chatContext.outputFile']
    if (!outputFilename) {
        throw new Error(
            'Missing cody-bench.chatContext.outputFile. To fix this problem, add "customConfiguration": { "cody-bench.chatContext.outputFile": "output.csv" } to the cody-bench JSON config.'
        )
    }
    const inputFile = path.join(options.workspace, inputFilename)
    const outputFile = path.join(options.snapshotDirectory, outputFilename)

    if (options.insecureTls) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    }

    const { examples, ignoredRecords } = await readExamplesFromCSV(inputFile)

    console.error(`ignoring ${ignoredRecords.length} malformed rows`)
    if (!outputFile) {
        throw new Error('no output file specified')
    }

    await runContextCommand(examples, outputFile)
}

async function runContextCommand(examples: Example[], outputFile: string): Promise<void> {
    const exampleOutputs: ExampleOutput[] = []

    for (const example of examples) {
        const { targetRepoRevs, query, essentialContext } = example
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
        const resultsResp = await graphqlClient.contextSearch({
            repoIDs,
            query,
            filePatterns: [],
        })
        if (isError(resultsResp)) {
            throw new Error(`contextSearch failed for [${repoNames.join(',')}]: ${resultsResp}`)
        }
        if (resultsResp === null) {
            throw new Error(`contextSearch failed for [${repoNames.join(',')}]: null results`)
        }
        const results = resultsResp ?? []
        const actualContext: EvalContextItem[] = results.map(result => ({
            repoName: result.repoName,
            path: result.path,
            startLine: result.startLine,
            endLine: result.endLine,
            content: result.content,
        }))

        exampleOutputs.push({
            ...example,
            actualContext,
            stats: {
                essentialRecall5: computeRecall(actualContext, essentialContext, 5),
                essentialRecall10: computeRecall(actualContext, essentialContext, 10),
                essentialRecall: computeRecall(actualContext, essentialContext),
            },
        })
    }

    await writeExamplesToCSV(outputFile, exampleOutputs)
}

function contextOverlaps(
    parentStr: string,
    childStr: string,
    threshold = { lines: 3, fraction: 0.2 }
): boolean {
    const parent = contextItemFromString(parentStr)
    const child = contextItemFromString(childStr)
    if (!parent || !child) {
        return false
    }

    const parentName = parent.repoName.split('/')?.pop() ?? ''
    const childName = child.repoName.split('/')?.pop() ?? ''
    if (parentName !== childName) {
        return false
    }
    if (parent.path !== child.path) {
        return false
    }
    if (parent.startLine > child.endLine) {
        return false
    }
    if (parent.endLine < child.startLine) {
        return false
    }
    const overlapStart = Math.max(parent.startLine, child.startLine)
    const overlapEnd = Math.min(parent.endLine, child.endLine)
    const overlapLength = overlapEnd - overlapStart + 1
    const parentLength = parent.endLine - parent.startLine + 1

    return overlapLength / parentLength >= threshold.fraction || overlapLength >= threshold.lines
}

function computeRecall(
    actualContext: EvalContextItem[],
    essentialContext: EvalContextItem[],
    cutoff?: number
): number {
    if (essentialContext.length === 0) {
        return 1
    }
    if (cutoff && actualContext.length > cutoff) {
        actualContext = actualContext.slice(0, cutoff)
    }
    let ct = 0
    for (const eItem of essentialContext) {
        let found = false
        for (const aItem of actualContext) {
            if (contextOverlaps(contextItemToString(eItem), contextItemToString(aItem))) {
                found = true
                break
            }
        }
        if (found) {
            ct++
        }
    }
    return ct / essentialContext.length
}
