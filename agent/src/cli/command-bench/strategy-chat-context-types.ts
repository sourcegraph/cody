import * as fs from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import { createObjectCsvWriter } from 'csv-writer'
import { mkdirp } from 'fs-extra'
import isError from 'lodash/isError'
import { stringify as yamlStringify } from 'yaml'

export interface ClientOptions {
    rewrite: boolean
    codeResultsCount: number
    textResultsCount: number
}

export interface EvalOutput {
    evaluatedAt: string
    codyClientVersion: string
    clientOptions: ClientOptions
    siteUserMetadata: {
        url: string
        sourcegraphVersion: string
        username: string
        userId: string
        evaluatedFeatureFlags: Record<string, boolean>
    }
}

export interface EvalContextItem {
    repoName: string
    path: string
    startLine: number
    endLine: number
    content?: string
    format: isUrlFormat ? 'url' as 'url' : 'old' as 'old'
    retriever?: string
}

interface RepoRev {
    repoName: string
    rev: string
}

function parseRepoRev(input: string): RepoRev | undefined {
    input = input.trim()
    if (input.length === 0) {
        return undefined
    }
    if (input.indexOf('@') === -1) {
        return undefined
    }
    const sepIndex = input.indexOf('@')
    return {
        repoName: input.substring(0, sepIndex),
        rev: input.substring(sepIndex + 1),
    }
}

function repoRevToString(repoRev: RepoRev): string {
    return `${repoRev.repoName}@${repoRev.rev}`
}

function parseRepoRevs(input: string): RepoRev[] {
    return input
        .split('\n')
        .filter(rr => rr.trim().length > 0)
        .flatMap(s => parseRepoRev(s) || [])
}

function repoRevsToString(repoRevs: RepoRev[]): string {
    return repoRevs.map(repoRevToString).join('\n')
}

function trimValOrUndefined(input: string): string | undefined {
    const trimmed = input.trim()
    return trimmed.length === 0 ? undefined : trimmed
}

function parseNewlineList(input: string): string[] {
    return input
        .split('\n')
        .map(s => s.trim())
        .filter(rr => rr.length > 0)
}

function parseContextList(input: string): EvalContextItem[] {
    return input
        .split(',')
        .map(s => s.trim())
        .filter(rr => rr.length > 0)
        .map(s => contextItemFromString(s))
}

export interface Example {
    datasetId: string
    type: string
    targetRepoRevs: RepoRev[]
    query: string
    essentialContext: EvalContextItem[]
    helpfulContext: EvalContextItem[]
    essentialFacts: string[]
    source?: string
    langs?: string[]
}

function exampleFromCsvRecord(record: any): Example {
    const repoRevs = parseRepoRevs(record.targetRepoRevs)
    return {
        datasetId: record.datasetId,
        type: record.type,
        targetRepoRevs: repoRevs,
        query: record.query?.trim(),

        essentialFacts: parseNewlineList(record.essentialFacts ?? ''),
        essentialContext: parseContextList(record.essentialContext ?? ''),
        helpfulContext: parseContextList(record.helpfulContext_optional ?? ''),

        langs: parseNewlineList(record.langs_optional),
        source: trimValOrUndefined(record.source_optional),
    }
}

export interface ExampleOutput extends Example {
    actualContext: EvalContextItem[]
}

export async function readExamplesFromCSV(filePath: string): Promise<Example[]> {
    const fileContent = await fs.readFile(filePath, { encoding: 'utf-8' })
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
    })

    const examples: Example[] = []
    for (let i = 0; i < records.length; i++) {
        const csvLine = i + 2 // index starts at 2, because 1-based indexing and header
        const record = records[i]
        if (record.query.trim(0).length === 0) {
            continue
        }

        try {
            const example = exampleFromCsvRecord(record)
            if (example.targetRepoRevs.length === 0) {
                throw new Error('No target repo revs extracted')
            }
            examples.push(example)
        } catch (error) {
            throw new Error(
                `Error in line ${csvLine} (${JSON.stringify(record)}): ${
                    isError(error) ? error.message : error
                }`
            )
        }
    }
    return examples
}

export async function writeYAMLMetadata(outputFile: string, evalOutput: EvalOutput): Promise<void> {
    await mkdirp(path.dirname(outputFile))
    await fs.writeFile(outputFile, yamlStringify(evalOutput))
}

export async function writeExamplesToCSV(outputFile: string, examples: ExampleOutput[]): Promise<void> {
    await mkdirp(path.dirname(outputFile))
    const csvWriter = createObjectCsvWriter({
        path: outputFile,
        header: [
            { id: 'datasetId', title: 'datasetId' },
            { id: 'type', title: 'type' },
            { id: 'targetRepoRevs', title: 'targetRepoRevs' },
            { id: 'query', title: 'query' },
            { id: 'essentialContext', title: 'essentialContext' },
            { id: 'helpfulContext_optional', title: 'helpfulContext_optional' },
            { id: 'langs_optional', title: 'langs_optional' },
            { id: 'source_optional', title: 'source_optional' },
            { id: 'actualContext', title: 'actualContext' },
        ],
    })
    await csvWriter
        .writeRecords(examples.map(exampleToCsvRecord))
        .then(() => console.log(`Wrote output to ${outputFile}`))
        .catch((err: any) => console.error('Error writing CSV file:', err))
}

function exampleToCsvRecord(example: ExampleOutput): any {
    return {
        datasetId: example.datasetId,
        type: example.type,
        targetRepoRevs: repoRevsToString(example.targetRepoRevs),
        query: example.query,
        essentialFacts: example.essentialFacts.join('\n'),
        essentialContext: example.essentialContext.map(contextItemToString).join('\n'),
        helpfulContext_optional: example.helpfulContext
            .map(c => `${c.repoName}:${c.path}:${c.startLine}-${c.endLine}`)
            .join('\n'),
        langs_optional: example.langs?.join('\n'),
        source_optional: example.source,
        actualContext: example.actualContext.map(item => contextItemToString(item)).join('\n'),
    }
}

export function contextItemFromString(item: string): EvalContextItem {
    // Handle new clickable link format which is "https://sourcegraph.sourcegraph.com/github.com/sourcegraph-testing/pinned-cody/-/blob/README.md?L42-43"
    if (item.startsWith('https://')) {
        const url = new URL(item)
        const pathParts = url.pathname.split('/-/blob/')
        const repoName = pathParts[0].replace('/github.com/', '')
        const path = pathParts[1]
        const lineRange = url.search.replace('?L', '').split('-')
        return {
            repoName,
            path,
            startLine: Number.parseInt(lineRange[0]),
            endLine: Number.parseInt(lineRange[1]),
            format: 'url',
        }
    }
    // Handle old format which is  "github.com/sourcegraph-testing/pinned-cody:README.md:42-43"
    const [repoName, path, lineRange] = item.split(':')
    if (!repoName || !path || !lineRange) {
        throw new Error(`Invalid context item: ${item}`)
    }
    const [startLine, endLine] = lineRange.split('-')
    return {
        repoName,
        path,
        startLine: Number.parseInt(startLine),
        endLine: Number.parseInt(endLine),
        format: 'old',
    }
}

export function contextItemToString(item: EvalContextItem): string {
    // Check format by examining the first essential context item to identify whether its old or new format
    if (item.format === 'url') {
        return `${item.retriever}:https://sourcegraph.sourcegraph.com/github.com/${item.repoName}/-/blob/${item.path}?L${item.startLine}-${item.endLine}`
    }
    return `${item.retriever}:${item.repoName}:${item.path}:${item.startLine}-${item.endLine}`
}
