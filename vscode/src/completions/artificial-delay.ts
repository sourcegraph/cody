import type { CompletionIntent } from '../tree-sitter/queries'
import { autocompleteOutputChannelLogger } from './output-channel-logger'

export const lowPerformanceConfig = {
    languageIds: new Set([
        'css',
        'html',
        'scss',
        'vue',
        'dart',
        'json',
        'yaml',
        'postcss',
        'markdown',
        'plaintext',
        'xml',
        'twig',
        'jsonc',
        'handlebars',
    ]),
    completionIntents: new Set(['comment', 'import.source']),
}

/**
 * Calculates the artificial delay to apply to code completions based on the language ID and completion intent.
 * The function adds a baseline latency for low-performance languages or low-performance completion intents,
 * unless the user has enabled the flag that stops this behavior.
 */
export function getArtificialDelay({
    languageId,
    codyAutocompleteDisableLowPerfLangDelay,
    completionIntent,
}: {
    languageId: string
    codyAutocompleteDisableLowPerfLangDelay: boolean
    completionIntent?: CompletionIntent
}): number {
    const isLowPerformance =
        lowPerformanceConfig.languageIds.has(languageId) ||
        (completionIntent ? lowPerformanceConfig.completionIntents.has(completionIntent) : false)

    const latency = !codyAutocompleteDisableLowPerfLangDelay && isLowPerformance ? 1000 : 0

    if (latency > 0) {
        autocompleteOutputChannelLogger.logDebug('getLatency', `Delay added: ${latency}`)
    }

    return latency
}
