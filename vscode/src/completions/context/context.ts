import * as vscode from 'vscode'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'

import { FeatureFlag, FeatureFlagProvider } from '../../services/FeatureFlagProvider'
import { ContextSnippet } from '../types'

import { getContextFromEmbeddings } from './context-embeddings'
import { getContextFromCurrentEditor } from './context-local'
import { DocumentHistory } from './history'

export interface GetContextOptions {
    document: vscode.TextDocument
    history: DocumentHistory
    prefix: string
    suffix: string
    jaccardDistanceWindowSize: number
    maxChars: number
    getCodebaseContext: () => CodebaseContext
    isEmbeddingsContextEnabled?: boolean
    featureFlagProvider: FeatureFlagProvider
}

export type ContextSummary = Readonly<{
    embeddings?: number
    local?: number
    duration: number
}>

export interface GetContextResult {
    context: ContextSnippet[]
    logSummary: ContextSummary
}

export async function getContext(options: GetContextOptions): Promise<GetContextResult> {
    const {
        maxChars,
        isEmbeddingsContextEnabled: isEmbeddingsContextEnabledInVSCodeConfig,
        featureFlagProvider,
    } = options
    const start = performance.now()

    const isEmbeddingsContextFeatureFlagEnabled = await featureFlagProvider.evaluateFeatureFlag(
        FeatureFlag.EmbeddingsContextEnabled
    )
    const isEmbeddingsContextEnabled = isEmbeddingsContextEnabledInVSCodeConfig && isEmbeddingsContextFeatureFlagEnabled

    /**
     * The embeddings context is sync to retrieve to keep the completions latency minimal. If it's
     * not available in cache yet, we'll retrieve it in the background and cache it for future use.
     */
    const embeddingsMatches = isEmbeddingsContextEnabled ? getContextFromEmbeddings(options) : []
    const localMatches = await getContextFromCurrentEditor(options)

    /**
     * Iterate over matches and add them to the context.
     * Discard editor matches for files with embedding matches.
     */
    const usedFilenames = new Set<string>()
    const context: ContextSnippet[] = []
    let totalChars = 0
    function addMatch(match: ContextSnippet): boolean {
        // TODO(@philipp-spiess): We should de-dupe on the snippet range and not
        // the file name to allow for more than one snippet of the same file
        if (usedFilenames.has(match.fileName)) {
            return false
        }
        usedFilenames.add(match.fileName)

        if (totalChars + match.content.length > maxChars) {
            return false
        }
        context.push(match)
        totalChars += match.content.length
        return true
    }

    // TODO(@philipp-spiess): Rank embedding results against local context
    // snippets instead of always appending embedding results at the top.
    let includedEmbeddingsMatches = 0
    for (const match of embeddingsMatches) {
        if (addMatch(match)) {
            includedEmbeddingsMatches++
        }
    }
    let includedLocalMatches = 0
    for (const match of localMatches) {
        if (addMatch(match)) {
            includedLocalMatches++
        }
    }

    return {
        context,
        logSummary: {
            ...(includedEmbeddingsMatches ? { embeddings: includedEmbeddingsMatches } : {}),
            ...(includedLocalMatches ? { local: includedLocalMatches } : {}),
            duration: performance.now() - start,
        },
    }
}
