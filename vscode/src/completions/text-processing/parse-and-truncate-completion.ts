import { Position, TextDocument } from 'vscode'

import { DocumentContext } from '../get-current-doc-context'
import { getDocumentQuerySDK } from '../tree-sitter/query-sdk'

import { parseCompletion, ParsedCompletion } from './parse-completion'
import { InlineCompletionItemWithAnalytics } from './process-inline-completions'
import { normalizeStartLine, truncateMultilineCompletion } from './truncate-multiline-completion'
import { truncateParsedCompletion } from './truncate-parsed-completion'

export interface ParseAndTruncateParams {
    document: TextDocument
    position: Position
    docContext: DocumentContext
    multiline: boolean
    useTreeSitter?: boolean
}

export function parseAndTruncateCompletion(
    completion: string,
    params: ParseAndTruncateParams
): InlineCompletionItemWithAnalytics {
    const {
        document,
        multiline,
        docContext,
        position,
        docContext: { prefix, suffix },
        useTreeSitter = true,
    } = params

    const insertTextBeforeTruncation = normalizeStartLine(completion, prefix)

    const parsed = parseCompletion({
        completion: { insertText: insertTextBeforeTruncation },
        document,
        position,
        docContext,
    })

    if (multiline) {
        const truncationResult = truncateMultilineBlock({
            parsed,
            document,
            suffix,
            prefix,
            useTreeSitter,
        })

        parsed.insertText = truncationResult.insertText
        parsed.truncatedWith = truncationResult.truncatedWith

        const initialLineCount = insertTextBeforeTruncation.split('\n').length
        const truncatedLineCount = parsed.insertText.split('\n').length
        parsed.lineTruncatedCount = initialLineCount - truncatedLineCount
    }

    return parsed
}

interface TruncateMultilineBlockParams {
    parsed: ParsedCompletion
    document: TextDocument
    prefix: string
    suffix: string
    useTreeSitter: boolean
}

interface TruncateMultilineBlockResult {
    truncatedWith: 'tree-sitter' | 'indentation'
    insertText: string
}

export function truncateMultilineBlock(params: TruncateMultilineBlockParams): TruncateMultilineBlockResult {
    const { parsed, document, prefix, suffix, useTreeSitter } = params
    const documentQuerySDK = getDocumentQuerySDK(document.languageId)

    if (useTreeSitter && parsed.tree && documentQuerySDK) {
        return {
            truncatedWith: 'tree-sitter',
            insertText: truncateParsedCompletion({ completion: parsed, document, documentQuerySDK }),
        } as const
    }

    return {
        truncatedWith: 'indentation',
        insertText: truncateMultilineCompletion(parsed.insertText, prefix, suffix, document.languageId),
    } as const
}
