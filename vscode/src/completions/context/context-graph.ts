import * as vscode from 'vscode'

import { logDebug } from '../../log'
import { ContextSnippet } from '../types'

import { GetContextResult } from './context'

export interface GraphContextFetcher extends vscode.Disposable {
    identifier: string
    getContextAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position,
        maxChars: number,
        contextRange?: vscode.Range
    ): Promise<ContextSnippet[]>
}

interface Options {
    document: vscode.TextDocument
    position: vscode.Position
    contextRange: vscode.Range
    maxChars: number
    graphContextFetcher?: GraphContextFetcher
}

export async function getContextFromGraph(options: Options): Promise<GetContextResult | undefined> {
    if (!supportedLanguageId(options.document.languageId)) {
        return undefined
    }

    const start = performance.now()
    const graphMatches = options.graphContextFetcher
        ? await options.graphContextFetcher.getContextAtPosition(
              options.document,
              options.position,
              options.maxChars,
              options.contextRange
          )
        : []

    if (graphMatches.length <= 0) {
        return undefined
    }

    const context: ContextSnippet[] = []
    let totalChars = 0
    let includedGraphMatches = 0
    for (const match of graphMatches) {
        if (totalChars + match.content.length > options.maxChars) {
            continue
        }
        context.push(match)
        totalChars += match.content.length
        includedGraphMatches++
    }

    logDebug(
        'GraphContext:autocomplete',
        `Added ${includedGraphMatches} graph matches for ${options.document.fileName}`,
        { verbose: graphMatches }
    )

    return {
        context,
        logSummary: {
            strategy: options.graphContextFetcher!.identifier,
            graph: includedGraphMatches,
            duration: performance.now() - start,
        },
    }
}

export function supportedLanguageId(languageId: string): boolean {
    switch (languageId) {
        case 'python':
        case 'go':
        case 'javascript':
        case 'javascriptreact':
        case 'typescript':
        case 'typescriptreact':
            return true
        default:
            return false
    }
}
