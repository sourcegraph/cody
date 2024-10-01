import * as fs from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import { createObjectCsvWriter } from 'csv-writer'
import { mkdirp } from 'fs-extra'
import isError from 'lodash/isError'
import { stringify as yamlStringify } from 'yaml'

export interface ClientOptions {
    rewrite: boolean
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
    examples: ExampleOutput[]
}

export interface EvalContextItem {
    repoName: string
    path: string
    startLine: number
    endLine: number
    content?: string
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
        .split('\n')
        .map(s => s.trim())
        .filter(rr => rr.length > 0)
        .flatMap(s => contextItemFromString(s))
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

interface Stats {
    essentialRecall5: number
    essentialRecall10: number
    essentialRecall: number
}

export interface ExampleOutput extends Example {
    actualContext: EvalContextItem[]
    stats: Stats
}

interface IgnoredRecord {
    line: number
    record: any
    reason: string
}

export async function readExamplesFromCSV(filePath: string): Promise<{
    examples: Example[]
    ignoredRecords: IgnoredRecord[]
}> {
    const fileContent = await fs.readFile(filePath, { encoding: 'utf-8' })
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
    })

    const examples: Example[] = []
    const ignoredRecords: IgnoredRecord[] = []
    for (let i = 0; i < records.length; i++) {
        const csvLine = i + 2 // index starts at 2, because 1-based indexing and header
        const record = records[i]
        if (record.query.trim(0).length === 0) {
            continue
        }

        try {
            const example = exampleFromCsvRecord(record)
            if (example.targetRepoRevs.length === 0) {
                ignoredRecords.push({
                    line: csvLine,
                    record,
                    reason: 'No target repo revs extracted',
                })
                continue
            }

            examples.push(example)
        } catch (error) {
            ignoredRecords.push({
                line: csvLine,
                record,
                reason: isError(error) ? error.message : `Error: ${error}`,
            })
        }
    }
    return {
        examples,
        ignoredRecords,
    }
}

/**
 * Note: this mutates evalOutput to remove the content field from actualContext context items.
 */
export async function writeYAMLMetadata(outputFile: string, evalOutput: EvalOutput): Promise<void> {
    await mkdirp(path.dirname(outputFile))

    for (const example of evalOutput.examples) {
        for (const contextItem of example.actualContext) {
            contextItem.content = undefined
        }
    }

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
            { id: 'essentialFacts', title: 'essentialFacts' },
            { id: 'essentialContext', title: 'essentialContext' },
            { id: 'helpfulContext_optional', title: 'helpfulContext_optional' },
            { id: 'langs_optional', title: 'langs_optional' },
            { id: 'source_optional', title: 'source_optional' },
            { id: 'actualContext', title: 'actualContext' },
            { id: 'stat_eRecall5', title: 'stat_eRecall5' },
            { id: 'stat_eRecall10', title: 'stat_eRecall10' },
            { id: 'stat_eRecall', title: 'stat_eRecall' },
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
        essentialContext: example.essentialContext
            .map(c => `${c.repoName}:${c.path}:${c.startLine}-${c.endLine}`)
            .join('\n'),
        helpfulContext_optional: example.helpfulContext
            .map(c => `${c.repoName}:${c.path}:${c.startLine}-${c.endLine}`)
            .join('\n'),
        langs_optional: example.langs?.join('\n'),
        source_optional: example.source,

        actualContext: example.actualContext.map(contextItemToString).join('\n'),

        stat_eRecall5: example.stats.essentialRecall5,
        stat_eRecall10: example.stats.essentialRecall10,
        stat_eRecall: example.stats.essentialRecall,
    }
}

export function contextItemFromString(item: string): EvalContextItem {
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
    }
}

export function contextItemToString(item: EvalContextItem): string {
    return `${item.repoName}:${item.path}:${item.startLine}-${item.endLine}`
}
