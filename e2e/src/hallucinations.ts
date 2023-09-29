import { DetectedEntity } from './entity-detection'
import { search } from './sourcegraph-api'

export async function detectHallucinations(codebase: string, entities: DetectedEntity[]): Promise<DetectedEntity[]> {
    const [filePathHallucinations, symbolHallucinations] = await Promise.all([
        detectFilePathHallucinations(
            codebase,
            entities.filter(entity => entity.type === 'path')
        ),
        detectSymbolHallucinations(
            codebase,
            entities.filter(entity => entity.type === 'symbol')
        ),
    ])
    return filePathHallucinations.concat(symbolHallucinations)
}

function escapeRegex(text: string): string {
    return text.replaceAll(/[$()*+./?[\\\]^{|}-]/g, '\\$&')
}

async function detectFilePathHallucinations(codebase: string, filePaths: DetectedEntity[]): Promise<DetectedEntity[]> {
    const hallucinations: DetectedEntity[] = []
    for (const filePath of filePaths) {
        const query = `repo:^${escapeRegex(codebase)}$ ${filePath.value} type:path count:1`
        const results = await search(query)
        if (results.length === 0) {
            hallucinations.push(filePath)
        }
    }
    return hallucinations
}

async function detectSymbolHallucinations(codebase: string, symbols: DetectedEntity[]): Promise<DetectedEntity[]> {
    const hallucinations: DetectedEntity[] = []
    for (const symbol of symbols) {
        const query = `repo:^${escapeRegex(codebase)}$ \\b${escapeRegex(
            symbol.value
        )}\\b patterntype:regexp case:yes count:1`
        const results = await search(query)
        if (results.length === 0) {
            hallucinations.push(symbol)
        }
    }
    return hallucinations
}
