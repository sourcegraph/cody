import * as fs from 'node:fs/promises'
import { graphqlClient } from '@sourcegraph/cody-shared'
import * as commander from 'commander'
import { parse } from 'csv-parse/sync'
import { createObjectCsvWriter } from 'csv-writer'
import { isError } from 'lodash'
import { Observable } from 'observable-fns'
import { dotcomCredentials } from '../../../../vscode/src/testutils/testing-credentials'

interface CodyContextOptions {
    srcAccessToken?: string
    srcEndpoint: string
    insecureTls?: boolean
    inputFile?: string
    outputFile?: string
}

export const contextCommand = new commander.Command('context')
    .description('Run a batch of queries against the Sourcegraph context API')
    .option('--insecure-tls', 'Allow insecure server connections when using SSL', false)
    .option('--input-file <file>', 'The CSV file to read examples from')
    .option('--output-file <file>', 'The CSV file to write output to')
    .addOption(
        new commander.Option(
            '--src-endpoint <url>',
            'The Sourcegraph URL endpoint to use for authentication'
        )
            .env('SRC_ENDPOINT')
            .default('https://sourcegraph.com')
    )
    .addOption(
        new commander.Option(
            '--src-access-token <token>',
            'The Sourcegraph access token to use for authentication'
        ).env('SRC_ACCESS_TOKEN')
    )
    .action(async (options: CodyContextOptions) => {
        if (options.insecureTls) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
        }
        if (!options.inputFile) {
            console.error('no input file specified')
            process.exit(1)
        }
        if (!options.outputFile) {
            console.error('no output file specified')
            process.exit(1)
        }
        if (!options.srcAccessToken) {
            const { token } = dotcomCredentials()
            if (!token) {
                console.error('environment variable SRC_ACCESS_TOKEN must be non-empty')
                process.exit(1)
            }
            options.srcAccessToken = token
        }
        if (!options.srcEndpoint) {
            console.error('environment variable SRC_ENDPOINT must be non-empty')
            process.exit(1)
        }

        graphqlClient.setResolvedConfigurationObservable(
            Observable.of({
                auth: {
                    accessToken: options.srcAccessToken,
                    serverEndpoint: options.srcEndpoint,
                    customHeaders: {},
                },
            })
        )

        const examples = await readExamplesFromCSV(options.inputFile)
        const exampleOutputs: ExampleOutput[] = []

        for (const { repoNames, query, essentialContext } of examples) {
            const repoIDNames = await graphqlClient.getRepoIds(repoNames, repoNames.length + 10)
            if (isError(repoIDNames)) {
                throw repoIDNames
            }
            const repoIDs = repoIDNames.map(repoIDName => repoIDName.id)
            const resultsResp = await graphqlClient.contextSearch({
                repoIDs,
                query,
                filePatterns: [],
            })
            if (isError(resultsResp)) {
                throw resultsResp
            }
            if (resultsResp === null) {
                throw new Error('!!! null results')
            }
            const results = resultsResp ?? []
            const actualContext = results.map(result => ({
                startLine: result.startLine,
                endLine: result.endLine,
                path: result.path,
                content: result.content,
                repoName: result.repoName,
            }))

            exampleOutputs.push({
                repoNames,
                query,
                essentialContext,
                actualContext,
                stats: {
                    essentialRecall5: computeRecall(actualContext, essentialContext, 5),
                    essentialRecall10: computeRecall(actualContext, essentialContext, 10),
                    essentialRecall: computeRecall(actualContext, essentialContext),
                },
            })
            results.map(r => r.path)
        }

        // Write exampleOutputs in CSV format
        const csvWriter = createObjectCsvWriter({
            path: options.outputFile,
            header: [
                { id: 'repoNames', title: 'repoNames' },
                { id: 'query', title: 'query' },
                { id: 'essentialContext', title: 'essentialContext' },
                { id: 'actualContext', title: 'actualContext' },
                { id: 'eRecall5', title: 'eRecall5' },
                { id: 'eRecall10', title: 'eRecall10' },
                { id: 'eRecall', title: 'eRecall' },
            ],
        })

        await csvWriter
            .writeRecords(
                exampleOutputs.map(output => ({
                    query: output.query,
                    repoNames: output.repoNames.join(', '),
                    essentialContext: output.essentialContext
                        .map(c => contextItemToString(c))
                        .join('\n'),
                    actualContext: output.actualContext.map(c => contextItemToString(c)).join('\n'),
                    eRecall5: output.stats.essentialRecall5,
                    eRecall10: output.stats.essentialRecall10,
                    eRecall: output.stats.essentialRecall,
                }))
            )
            .then(() => console.log(`Wrote output to ${options.outputFile}`))
            .catch((err: any) => console.error('Error writing CSV file:', err))

        process.exit(0)
    })

interface EvalContextItem {
    repoName: string
    path: string
    startLine: number
    endLine: number
    content?: string
}

interface Example {
    repoNames: string[]
    query: string
    essentialContext: EvalContextItem[]
}

interface Stats {
    essentialRecall5: number
    essentialRecall10: number
    essentialRecall: number
}

interface ExampleOutput extends Example {
    actualContext: EvalContextItem[]
    stats: Stats
}

async function readExamplesFromCSV(filePath: string): Promise<Example[]> {
    const fileContent = await fs.readFile(filePath, { encoding: 'utf-8' })
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
    })

    const examples: Example[] = []
    for (const record of records) {
        const repoNames: string[] = []
        for (const name of record.repoNames.split('\n')) {
            if (name.trim().length === 0) {
                continue
            }
            repoNames.push(name.trim())
        }

        const essentialContext: EvalContextItem[] = []
        for (const line of record.essentialContext.split('\n')) {
            if (line.trim().length === 0) {
                continue
            }
            const contextItem = contextItemFromString(line.trim())
            if (contextItem) {
                essentialContext.push(contextItem)
            }
        }

        examples.push({
            repoNames,
            query: record.query,
            essentialContext,
        })
    }
    return examples
}

function contextItemFromString(item: string): EvalContextItem | undefined {
    const [repoName, pathAndLineRange] = item.split(' ')
    const [path, lineRange] = pathAndLineRange.split(':')
    const [startLine, endLine] = lineRange.split('-')
    return {
        repoName,
        path,
        startLine: Number.parseInt(startLine),
        endLine: Number.parseInt(endLine),
    }
}

function contextItemToString(item: EvalContextItem): string {
    return `${item.repoName} ${item.path}:${item.startLine}-${item.endLine}`
}

function contextOverlaps(parentStr: string, childStr: string, threshold = 0.2): boolean {
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

    return overlapLength / parentLength >= threshold
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
