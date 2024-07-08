import type { RpcMessageHandler } from '../../jsonrpc-alias'

import { execSync } from 'node:child_process'
import { type AutocompleteMatchKind, AutocompleteMatcher } from './AutocompleteMatcher'
import { EvaluationDocument } from './EvaluationDocument'
import type { CodyBenchOptions } from './command-bench'
import { evaluateEachFile } from './evaluateEachFile'
import { matchesGlobPatterns } from './matchesGlobPatterns'
import { triggerAutocomplete } from './triggerAutocomplete'

export async function evaluateAutocompleteStrategy(
    client: RpcMessageHandler,
    options: CodyBenchOptions
): Promise<void> {
    let remainingTests = options.testCount
    const matchCounts = new Map<AutocompleteMatchKind, number>()
    const files = execSync('git ls-files', { cwd: options.workspace }).toString().split('\n')
    files.sort()
    await evaluateEachFile(files, options, async params => {
        const { file, content, uri, queries, grammarDirectory } = params

        const document = EvaluationDocument.from(params, options)
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

            try {
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
            } catch (error) {
                console.error('triggerAutocomplete', error)
            }
            remainingTests--
        }

        return document
    })
}
