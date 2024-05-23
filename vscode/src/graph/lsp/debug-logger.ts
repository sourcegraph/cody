import type * as vscode from 'vscode'

import { extractHoverContent } from './hover'
import {
    getDefinitionLocations,
    getHover,
    getImplementationLocations,
    getTextFromLocation,
    getTypeDefinitionLocations,
} from './lsp-commands'
import type { SymbolSnippetsRequest } from './symbol-context-snippets'

export const IS_LSP_LIGHT_LOGGING_ENABLED = process.env.LSP_LIGHT_LOGGING_ENABLED === 'true'

const debugLogs: Map<string, unknown[][]> = new Map()

/**
 * Group logs by symbol names to log them together later
 */
export function debugSymbol(symbolName: string, ...rest: unknown[]) {
    if (!debugLogs.has(symbolName)) {
        debugLogs.set(symbolName, [])
    }

    debugLogs.get(symbolName)!.push(rest)
}

/**
 * console.log() logs grouped by symbols name when process.env.IS_LSP_LIGHT_LOGGING_ENABLED === 'true'
 */
export function flushLspLightDebugLogs() {
    for (const [symbolName, symbolLogs] of debugLogs.entries()) {
        for (const log of symbolLogs) {
            if (typeof log[0] === 'string' && log[0].includes('---')) {
                console.log(log[0])
            } else {
                console.log(`[${symbolName}]`, ...log)
            }
        }
    }

    debugLogs.clear()
}

export async function debugLSP(symbolSnippetRequest: SymbolSnippetsRequest) {
    const { uri, position } = symbolSnippetRequest

    async function printHoverAndText(locations: vscode.Location[]) {
        for (const location of locations) {
            const hoverContent = await getHover(location.uri, location.range.start)
            console.log(
                '--location.uri',
                location.uri.toString().split('/').slice(-3).join('/'),
                `${location.range.start.line}:${location.range.start.character}`,
                `${location.range.end.line}:${location.range.end.character}`
            )
            console.log(
                '----hover',
                extractHoverContent(hoverContent).map(x => `${x.kind || 'unknown'}:${x.text}`)
            )
            console.log('----text', await getTextFromLocation(location))
        }
    }

    const implementations = await getImplementationLocations(uri, position)
    const definitions = await getDefinitionLocations(uri, position)
    const typeDefinitions = await getTypeDefinitionLocations(uri, position)
    // TODO: handle cases where getTypeDefinitionLocations returns return value location for a fully typed function
    console.log('hover', ...(await getHover(uri, position)))
    console.log('implementations')
    await printHoverAndText(implementations)

    console.log('definition')
    await printHoverAndText(definitions)
    console.log('type definition')
    await printHoverAndText(typeDefinitions)
}

export function formatUriAndRange(uri: vscode.Uri, range: vscode.Range) {
    const path = uri.toString().split('/').slice(-4).join('/')
    const start = `${range.start.line}:${range.start.character}`
    const end = `${range.end.line}:${range.end.character}`

    return `${path}:${start} – ${end}`
}

export function formatUriAndPosition(uri: vscode.Uri, position: vscode.Position) {
    const path = uri.toString().split('/').slice(-4).join('/')
    const start = `${position.line}:${position.character}`

    return `${path}:${start}`
}
