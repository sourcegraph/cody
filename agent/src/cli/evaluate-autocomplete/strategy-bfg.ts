import { execSync } from 'child_process'
import * as path from 'path'
import * as fspromises from 'fs/promises'

import * as vscode from 'vscode'

import { getParseLanguage } from '../../../../vscode/src/tree-sitter/grammars'
import type { MessageHandler } from '../../jsonrpc-alias'
import { getLanguageForFileName } from '../../language'

import { type AutocompleteMatchKind, AutocompleteMatcher } from './AutocompleteMatcher'
import { EvaluationDocument } from './EvaluationDocument'
import { Queries } from './Queries'
import { SnapshotWriter } from './SnapshotWriter'
import type { EvaluateAutocompleteOptions } from './evaluate-autocomplete'
import { matchesGlobPatterns } from './matchesGlobPatterns'
import { testCleanup, testInstall } from './testTypecheck'
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
    const { workspace } = options
    const queries = new Queries(options.queriesDirectory)
    const grammarDirectory = path.normalize(options.treeSitterGrammars)
    const files = execSync('git ls-files', { cwd: workspace }).toString().split('\n')
    files.sort()
    let remainingTests = options.testCount
    const snapshots = new SnapshotWriter(options)
    await testInstall(options)
    try {
        await snapshots.writeHeader()

        const revision = execSync('git rev-parse HEAD', { cwd: workspace }).toString().trim()

        const matchCounts = new Map<AutocompleteMatchKind, number>()

        for (const file of files) {
            if (
                !matchesGlobPatterns(options.includeFilepath ?? [], options.excludeFilepath ?? [], file)
            ) {
                continue
            }
            const filePath = path.join(workspace, file)
            const uri = vscode.Uri.file(filePath)
            const stat = await fspromises.stat(filePath)
            if (!stat.isFile()) {
                continue
            }
            const content = (await fspromises.readFile(filePath)).toString()
            const languageid = getLanguageForFileName(file)
            const language = getParseLanguage(languageid)
            if (!language) {
                continue
            }
            if (
                !matchesGlobPatterns(
                    options.includeLanguage ?? [],
                    options.excludeLanguage ?? [],
                    languageid
                )
            ) {
                continue
            }
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
                continue
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

            await snapshots.writeDocument(document)
        }
    } finally {
        await testCleanup(options)
    }
}
