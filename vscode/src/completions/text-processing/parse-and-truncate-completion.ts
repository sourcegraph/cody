import type { TextDocument } from 'vscode'
import type { SyntaxNode } from 'web-tree-sitter'

import { addAutocompleteDebugEvent } from '../../services/open-telemetry/debug-utils'

import type { DocumentContext } from '@sourcegraph/cody-shared'
import { type ParsedCompletion, parseCompletion } from './parse-completion'
import type { InlineCompletionItemWithAnalytics } from './process-inline-completions'
import { normalizeStartLine, truncateMultilineCompletion } from './truncate-multiline-completion'
import { truncateParsedCompletion } from './truncate-parsed-completion'

interface ParseAndTruncateParams {
    document: TextDocument
    docContext: DocumentContext
}

export function parseAndTruncateCompletion(
    completion: string,
    params: ParseAndTruncateParams
): InlineCompletionItemWithAnalytics {
    const {
        document,
        docContext,
        docContext: { multilineTrigger, prefix },
    } = params

    const multiline = Boolean(multilineTrigger)
    const insertTextBeforeTruncation = (
        multiline ? normalizeStartLine(completion, prefix) : completion
    ).trimEnd()

    const parsed = parseCompletion({
        completion: { insertText: insertTextBeforeTruncation },
        document,
        docContext,
    })

    addAutocompleteDebugEvent('parsed', {
        currentLinePrefix: docContext.currentLinePrefix,
        text: parsed.insertText,
    })

    if (parsed.insertText === '') {
        return parsed
    }

    if (multiline) {
        const truncationResult = truncateMultilineBlock({
            parsed,
            document,
            docContext,
        })

        const initialLineCount = insertTextBeforeTruncation.split('\n').length
        const truncatedLineCount = truncationResult.insertText.split('\n').length

        parsed.lineTruncatedCount = initialLineCount - truncatedLineCount
        addAutocompleteDebugEvent('lineTruncatedCount', {
            lineTruncatedCount: parsed.lineTruncatedCount,
        })

        parsed.insertText = truncationResult.insertText
        parsed.truncatedWith = truncationResult.truncatedWith
    }

    return parsed
}

interface TruncateMultilineBlockParams {
    parsed: ParsedCompletion
    docContext: DocumentContext
    document: TextDocument
}

interface TruncateMultilineBlockResult {
    truncatedWith: 'tree-sitter' | 'indentation'
    insertText: string
    nodeToInsert?: SyntaxNode
}

function truncateMultilineBlock(params: TruncateMultilineBlockParams): TruncateMultilineBlockResult {
    const { parsed, docContext, document } = params

    if (parsed.tree) {
        return {
            truncatedWith: 'tree-sitter',
            ...truncateParsedCompletion({
                completion: parsed,
                docContext,
                document,
            }),
        }
    }

    const { prefix, suffix } = docContext

    return {
        truncatedWith: 'indentation',
        insertText: truncateMultilineCompletion(parsed.insertText, prefix, suffix, document.languageId),
    }
}
