import * as path from 'node:path'

import type { MessageHandler } from '../../jsonrpc-alias'

import { type AutocompleteMatchKind, AutocompleteMatcher } from './AutocompleteMatcher'
import { EvaluationDocument } from './EvaluationDocument'
import type { EvaluateAutocompleteOptions } from './cody-bench'
import { evaluateEachFile } from './evaluateEachFile'
import { matchesGlobPatterns } from './matchesGlobPatterns'
import { triggerAutocomplete } from './triggerAutocomplete'

/**
 * Runs autocomplete evaluation. The current logic is specifically optimized
 * to evaluate BFG.  The best way to customize the logic is by changing the
 * code. Eventually, we could make the logic configurable via command-line
 * flags so that we can reuse this command for different kinds of evaluations.
 */
export async function evaluateBfgStrategy(
    client: MessageHandler,
    options: EvaluateAutocompleteOptions
): Promise<void> {
    let remainingTests = options.testCount
    const matchCounts = new Map<AutocompleteMatchKind, number>()
    evaluateEachFile(
        options,
        async ({ file, content, uri, languageid, revision, queries, grammarDirectory }) => {
            const document = new EvaluationDocument(
                {
                    languageid,
                    filepath: file,
                    strategy: options.fixture.strategy,
                    fixture: options.fixture.name,
                    workspace: path.basename(options.workspace),
                    revision,
                },
                content,
                uri
            )
            const matcher = new AutocompleteMatcher(document.params, queries, grammarDirectory)
            const matches = await matcher.matches(content)
            if (matches === undefined) {
                return
            }
            client.notify('textDocument/didOpen', { uri: uri.toString(), content })
            const documentTestCountStart = remainingTests

            for (const match of matches) {
                if (documentTestCountStart - remainingTests > options.maxFileTestCount) {
                    console.log(
                        `--max-file-test-count=${options.maxFileTestCount} limit hit for file '${file}'`
                    )
                    break
                }
                if (remainingTests <= 0) {
                    break
                }
                if (options?.matchMinimumSize && match.removedText.length < options.matchMinimumSize) {
                    continue
                }
                if (
                    !matchesGlobPatterns(
                        options.includeMatchKind ?? [],
                        options.excludeMatchKind ?? [],
                        match.kind
                    )
                ) {
                    continue
                }

                if (match.removedRange.isSingleLine && options.matchSkipSingleline) {
                    continue
                }

                const matchCount = matchCounts.get(match.kind) ?? 0
                if (options.matchKindDistribution && matchCount > 10) {
                    const min = Math.min(...matchCounts.values())
                    const allowedMax = options.matchKindDistribution * min
                    if (matchCount >= allowedMax) {
                        continue
                    }
                }

                matchCounts.set(match.kind, matchCount + 1)
                if (options.matchEveryN && matchCount % options.matchEveryN !== 0) {
                    continue
                }

                await triggerAutocomplete({
                    parser: matcher.parser,
                    originalTree: matcher.originalTree,
                    originalTreeIsErrorFree: matcher.originalTreeIsFreeOfErrrors,

                    range: match.removedRange,
                    autocompleteKind: match.kind,
                    client,
                    document,
                    options,
                    modifiedContent: match.newText,
                    removedContent: match.removedText,
                    position: match.requestPosition,
                })
                remainingTests--
            }

            return document
        }
    )
}
