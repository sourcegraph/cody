import { Position, TextDocument } from 'vscode'

import { DocumentContext } from '../get-current-doc-context'

import { parseCompletion, ParsedCompletion } from './parse-completion'
import { InlineCompletionItemWithAnalytics } from './process-inline-completions'
import { normalizeStartLine, truncateMultilineCompletion } from './truncate-multiline-completion'
import { truncateParsedCompletionByNextSibling } from './truncate-parsed-completion'

export interface ParseAndTruncateParams {
    document: TextDocument
    position: Position
    docContext: DocumentContext
    multiline: boolean
}

export function parseAndTruncateCompletion(
    completion: string,
    params: ParseAndTruncateParams
): InlineCompletionItemWithAnalytics {
    const {
        document,
        multiline,
        docContext,
        docContext: { prefix },
    } = params

    const insertTextBeforeTruncation = multiline ? normalizeStartLine(completion, prefix) : completion

    const parsed = parseCompletion({
        completion: { insertText: insertTextBeforeTruncation },
        document,
        docContext,
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
}

export function truncateMultilineBlock(params: TruncateMultilineBlockParams): TruncateMultilineBlockResult {
    const { parsed, docContext, document } = params

    if (parsed.tree) {
        return {
            truncatedWith: 'tree-sitter',
            insertText: truncateParsedCompletionByNextSibling({
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
