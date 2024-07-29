import * as fspromises from 'node:fs/promises'
import path from 'node:path'

import type { ObjectHeaderItem } from 'csv-writer/src/lib/record'
import type * as vscode from 'vscode'

import type {
    CompletionBookkeepingEvent,
    CompletionItemInfo,
} from '../../../../vscode/src/completions/logger'
import { ProtocolTextDocumentWithUri } from '../../../../vscode/src/jsonrpc/TextDocumentWithUri'
import { AgentTextDocument } from '../../AgentTextDocument'

import type { ContextItemSource } from '@sourcegraph/cody-shared'
import type { AutocompleteMatchKind } from './AutocompleteMatcher'
import { BenchStrategy, type CodyBenchOptions } from './command-bench'
import type { EvaluateFileParams } from './evaluateEachFile'

export type EvaluationDocumentParams = Pick<
    EvaluationItem,
    'languageid' | 'workspace' | 'strategy' | 'fixture' | 'filepath' | 'revision'
>

export class EvaluationDocument {
    public items: EvaluationItem[] = []
    public readonly lines: string[]
    public readonly textDocument: AgentTextDocument
    public static from(params: EvaluateFileParams, options: CodyBenchOptions): EvaluationDocument {
        return new EvaluationDocument(
            {
                languageid: params.languageid,
                filepath: params.file,
                strategy: options.fixture.strategy,
                fixture: options.fixture.name,
                workspace: path.basename(options.workspace),
                revision: params.revision,
            },
            params.content,
            params.uri,
            options
        )
    }
    constructor(
        public readonly params: EvaluationDocumentParams,
        public readonly text: string,
        public readonly uri: vscode.Uri,
        public readonly options: Pick<CodyBenchOptions, 'fixture'>,
        public readonly snapshotDirectory?: string
    ) {
        this.lines = text.split('\n')
        this.textDocument = new AgentTextDocument(
            ProtocolTextDocumentWithUri.from(uri, { content: text })
        )
    }

    public pushItem(
        item: Omit<
            EvaluationItem,
            'languageid' | 'workspace' | 'strategy' | 'fixture' | 'filepath' | 'revision'
        >
    ): void {
        item.rangeStartLine = item.range.start.line
        item.rangeStartCharacter = item.range.start.character
        item.rangeEndLine = item.range.end.line
        item.rangeEndCharacter = item.range.end.character
        item.multiline = item.event?.params?.multiline
        item.completionIntent = item.event?.params?.completionIntent
        item.providerIdentifier = item.event?.params?.providerIdentifier
        item.providerModel = item.event?.params?.providerModel
        item.stopReason = item.info?.stopReason
        item.resultCharacterCount = item?.info?.charCount
        const retrieverStats = item.event?.params?.contextSummary?.retrieverStats ?? {}
        for (const retriever of Object.keys(retrieverStats)) {
            if (retriever === 'bfg') {
                item.contextBfgRetrievedCount = retrieverStats[retriever].retrievedItems
                item.contextBfgSuggestedCount = retrieverStats[retriever].suggestedItems
                item.contextBfgDurationMs = retrieverStats[retriever].duration
            }
        }
        if (item.event) {
            item.eventJSON = JSON.stringify(item.event)
        }
        if (item.contextItems) {
            item.contextItemsJSON = JSON.stringify(item.contextItems, null, 2)
        }
        this.items.push({
            ...item,
            ...this.params,
        })
    }

    public async writeSnapshot(snapshotDirectory: string): Promise<void> {
        const outputPath = path.join(snapshotDirectory, this.params.filepath)
        await fspromises.mkdir(path.dirname(outputPath), { recursive: true })
        const snapshot = this.formatSnapshot()
        await fspromises.writeFile(outputPath, snapshot)
    }

    // This function is copy/pasted from the scip-typescript repository so that we
    // can customize rendering for the `cody-bench` command. For example,
    // we will need to come up with a good solution for multi-line completions that may not
    // be relevant for scip-typescript.
    public formatSnapshot(): string {
        const commentSyntax = commentSyntaxForLanguage(this.params.languageid)
        const out: string[] = []
        const pushMultilineText = (kind: string, text: string): void => {
            out.push('\n')
            for (const line of text.split('\n')) {
                out.push(commentSyntax)
                out.push(` ${kind} `)
                out.push(line)
                out.push('\n')
            }
        }
        this.items.sort(compareItemByRange)
        let occurrenceIndex = 0
        for (const [lineNumber, line] of this.lines.entries()) {
            out.push(' '.repeat(commentSyntax.length))
            out.push(line.replace('\t', ' '))
            out.push('\n')
            while (
                occurrenceIndex < this.items.length &&
                this.items[occurrenceIndex].rangeStartLine === lineNumber
            ) {
                const item = this.items[occurrenceIndex]
                occurrenceIndex++
                out.push(commentSyntax)
                out.push(' '.repeat(item.range.start.character))
                const length = item.range.isSingleLine
                    ? item.range.end.character - item.range.start.character
                    : this.textDocument.lineAt(item.range.start.line).text.length -
                      item.range.start.character
                if (length < 0) {
                    throw new Error(this.format(item.range, 'negative length occurrence!'))
                }
                out.push('^'.repeat(length))
                if (!item.range.isSingleLine) {
                    out.push(` ${item.range.end.line}:${item.range.end.character}`)
                }
                if (this.options.fixture.strategy === BenchStrategy.Autocomplete) {
                    out.push(' AUTOCOMPLETE')
                } else if (this.options.fixture.strategy === BenchStrategy.Fix) {
                    out.push(' FIX')
                } else if (this.options.fixture.strategy === BenchStrategy.Chat) {
                    out.push(' CHAT')
                } else if (this.options.fixture.strategy === BenchStrategy.UnitTest) {
                    out.push(' UNIT TEST')
                } else {
                    throw new Error(`unknown strategy ${this.options.fixture.strategy}`)
                }
                if (item.chatQuestion) {
                    pushMultilineText('CHAT_QUESTION', item.chatQuestion)
                }
                if (item.chatReply) {
                    pushMultilineText('CHAT_REPLY', item.chatReply)
                }
                if (item.resultExact) {
                    out.push(' EXACT_MATCH')
                }
                if (item.contextItems) {
                    pushMultilineText('CONTEXT_ITEMS', item.contextItemsJSON ?? '[]')
                }
                if (item.resultEmpty) {
                    out.push(' EMPTY_RESULT')
                }
                if (item.resultTimeout) {
                    out.push(' TIMEOUT')
                }
                if (item.resultExact) {
                    out.push(' EXACT_MATCH')
                }
                if (item.resultParses === true) {
                    out.push(' PARSE_OK')
                } else if (item.resultParses === false) {
                    out.push(' PARSE_ERROR')
                }
                if (item.resultTypechecks === true) {
                    out.push(' TYPECHECK_OK')
                } else if (item.resultTypechecks === false) {
                    out.push(' TYPECHECK_ERROR')
                }
                if (item.fixBeforeDiagnostic) {
                    pushMultilineText('DIAGNOSTIC_BEFORE', item.fixBeforeDiagnostic)
                }
                if (item.editDiff) {
                    pushMultilineText('DIFF', item.editDiff)
                }
                if (item.fixAfterDiagnostic) {
                    pushMultilineText('DIAGNOSTIC_AFTER', item.fixAfterDiagnostic)
                }
                if (item.resultText) {
                    out.push(' RESULT ')
                    out.push(item.resultText.replaceAll('\n', '\\n'))
                }
                out.push('\n')
            }
        }
        return out.join('')
    }

    /**
     * For debugingg purposes, formats the source file with carets ^ to underline
     * the range. For example, when given the range enclosing the `hello`
     * identifier.
     * ```
     * src/hello.ts:LINE:CHARACTER
     * const hello = 42
     * ^^^^^
     * ```
     * @param range the range to highlight
     * @param diagnostic optional message to include with the formatted string
     */
    public format(range: vscode.Range, diagnostic?: string): string {
        const line = this.lines[range.start.line]
        const indent = ' '.repeat(range.start.character)
        const length =
            range.start.line === range.end.line
                ? range.end.character - range.start.character
                : line.length - range.start.character
        const carets = length < 0 ? '<negative length>' : '^'.repeat(length)
        const multilineSuffix = range.isSingleLine ? '' : ` ${range.end.line}:${range.end.character}`
        const message = diagnostic ? ` ${diagnostic}` : ''
        const previousLine = range.start.line > 0 ? this.lines[range.start.line - 1] : ''
        const nextLine = range.start.line < this.lines.length - 1 ? this.lines[range.start.line + 1] : ''
        return `${this.params.filepath}:${range.start.line}:${range.start.character}${message}\n${previousLine}\n${line}\n${indent}${carets}${multilineSuffix}\n${nextLine}`
    }

    public log(range: vscode.Range): void {
        console.log(this.format(range))
    }
}

/**
 * An AutocompleteItem represents one row in the final CSV file that
 * cody-bench emits.
 */
interface EvaluationItem {
    languageid: string
    workspace: string
    fixture: string
    strategy: string
    filepath: string
    revision: string
    range: vscode.Range
    multiline?: boolean
    completionIntent?: string
    autocompleteKind?: AutocompleteMatchKind
    providerIdentifier?: string
    providerModel?: string
    stopReason?: string
    rangeStartLine?: number
    rangeStartCharacter?: number
    rangeEndLine?: number
    rangeEndCharacter?: number
    resultNonInsertPatch?: boolean
    resultTimeout?: boolean
    resultError?: string
    resultEmpty?: boolean
    resultExact?: boolean
    resultTypechecks?: boolean
    resultParses?: boolean
    resultText?: string
    contextBfgRetrievedCount?: number
    contextBfgSuggestedCount?: number
    contextBfgDurationMs?: number
    resultCharacterCount?: number
    editDiff?: string
    chatReply?: string
    chatQuestion?: string
    contextItems?: ContextItem[]
    contextItemsJSON?: string
    questionClass?: string
    fixBeforeDiagnostic?: string
    fixAfterDiagnostic?: string
    llmJudgeScore?: number
    llmJudgeReasoning?: string
    concisenessScore?: number
    hedges?: boolean
    info?: CompletionItemInfo
    event?: CompletionBookkeepingEvent
    eventJSON?: string
    testName?: string
    testExpectedFilename?: string
    testFilename?: string
    testInputFilename?: string
    testLanguage?: string
    testGenerated?: string
    testUsedExpectedTestFramework?: boolean
    testUsedCorrectAppendOperation?: boolean
    testDiagnostics?: string
}

interface ContextItem {
    source?: ContextItemSource
    file: string
    content?: string | null
}

interface EvaluationItemHeader extends ObjectHeaderItem {
    id: keyof EvaluationItem
}

export const headerItems: EvaluationItemHeader[] = [
    { id: 'languageid', title: 'LANGUAGEID' },
    { id: 'workspace', title: 'WORKSPACE' },
    { id: 'fixture', title: 'FIXTURE' },
    { id: 'strategy', title: 'STRATEGY' },
    { id: 'filepath', title: 'FILEPATH' },
    { id: 'revision', title: 'REVISION' },
    { id: 'multiline', title: 'MULTILINE' },
    { id: 'completionIntent', title: 'COMPLETION_INTENT' },
    { id: 'autocompleteKind', title: 'AUTOCOMPLETE_KIND' },
    { id: 'rangeStartLine', title: 'RANGE_START_LINE' },
    { id: 'rangeStartCharacter', title: 'RANGE_START_CHARACTER' },
    { id: 'rangeEndLine', title: 'RANGE_END_LINE' },
    { id: 'rangeEndCharacter', title: 'RANGE_END_CHARACTER' },
    { id: 'resultTimeout', title: 'RESULT_TIMEOUT' },
    { id: 'resultError', title: 'RESULT_ERROR' },
    { id: 'resultEmpty', title: 'RESULT_EMPTY' },
    { id: 'resultExact', title: 'RESULT_EXACT' },
    { id: 'resultTypechecks', title: 'RESULT_TYPECHECKS' },
    { id: 'resultParses', title: 'RESULT_PARSES' },
    { id: 'resultText', title: 'RESULT_TEXT' },
    { id: 'resultCharacterCount', title: 'RESULT_CHAR_COUNT' },
    { id: 'resultNonInsertPatch', title: 'RESULT_NON_INSERT_PATCH' },
    { id: 'editDiff', title: 'EDIT_DIFF' },
    { id: 'chatReply', title: 'CHAT_REPLY' },
    { id: 'chatQuestion', title: 'CHAT_QUESTION' },
    { id: 'contextItemsJSON', title: 'CONTEXT_ITEMS' },
    { id: 'questionClass', title: 'QUESTION_CLASS' },
    { id: 'fixAfterDiagnostic', title: 'FIX_AFTER_DIAGNOSTIC' },
    { id: 'fixBeforeDiagnostic', title: 'FIX_BEFORE_DIAGNOSTIC' },
    { id: 'llmJudgeScore', title: 'LLM_JUDGE_SCORE' },
    { id: 'llmJudgeReasoning', title: 'LLM_JUDGE_REASONING' },
    { id: 'concisenessScore', title: 'CONCISENESS_SCORE' },
    { id: 'hedges', title: 'HEDGES' },
    { id: 'providerIdentifier', title: 'PROVIDER_IDENTIFIER' },
    { id: 'providerModel', title: 'PROVIDER_MODEL' },
    { id: 'stopReason', title: 'STOP_REASON' },
    { id: 'contextBfgRetrievedCount', title: 'CONTEXT_BFG_RETRIEVED_COUNT' },
    { id: 'contextBfgSuggestedCount', title: 'CONTEXT_BFG_SUGGESTED_COUNT' },
    { id: 'contextBfgDurationMs', title: 'CONTEXT_BFG_DURATION_MS' },
    { id: 'eventJSON', title: 'EVENT' },
    { id: 'testFilename', title: 'TEST_FILENAME' },
    { id: 'testExpectedFilename', title: 'TEST_EXPECTED_FILENAME' },
    { id: 'testGenerated', title: 'TEST_GENERATED' },
    { id: 'testUsedExpectedTestFramework', title: 'TEST_USED_EXPECTED_TEST_FRAMEWORK' },
    { id: 'testUsedCorrectAppendOperation', title: 'TEST_USED_CORRECT_APPEND_OPERATION' },
    { id: 'testInputFilename', title: 'TEST_INPUT_FILENAME' },
    { id: 'testLanguage', title: 'TEST_LANGUAGE' },
    { id: 'testName', title: 'TEST_NAME' },
    { id: 'testDiagnostics', title: 'TEST_DIAGNOSTICS' },
]

function commentSyntaxForLanguage(languageid: string): string {
    switch (languageid) {
        case 'haskell':
        case 'lua':
            return '--'
        case 'python':
        case 'ruby':
        case 'yaml':
        case 'dockerfile':
        case 'toml':
        case 'perl':
        case 'perl6':
            return '#'
        default:
            return '//'
    }
}

function compareItemByRange(a: EvaluationItem, b: EvaluationItem): number {
    const byStart = a.range.start.compareTo(b.range.start)
    if (byStart !== 0) {
        return byStart
    }
    return a.range.end.compareTo(b.range.end)
}
