import { TextDocument } from 'vscode'

import { DocumentContext } from '../get-current-doc-context'
import { completionPostProcessLogger } from '../post-process-logger'

import { parseCompletion, ParsedCompletion } from './parse-completion'
import { InlineCompletionItemWithAnalytics } from './process-inline-completions'
import { normalizeStartLine, truncateMultilineCompletion } from './truncate-multiline-completion'
import { truncateParsedCompletion } from './truncate-parsed-completion'

export interface ParseAndTruncateParams {
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
        docContext: { multilineTrigger, completionPostProcessId, prefix },
    } = params

    const multiline = Boolean(multilineTrigger)
    const insertTextBeforeTruncation = (multiline ? normalizeStartLine(completion, prefix) : completion).trimEnd()

    const parsed = parseCompletion({
        completion: { insertText: insertTextBeforeTruncation },
        document,
        docContext,
    })

    completionPostProcessLogger.info({ completionPostProcessId, stage: 'parsed', text: parsed.insertText })

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
        completionPostProcessLogger.info({
            completionPostProcessId,
            stage: 'lineTruncatedCount',
            text: String(parsed.lineTruncatedCount),
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
}

export function truncateMultilineBlock(params: TruncateMultilineBlockParams): TruncateMultilineBlockResult {
    const { parsed, docContext, document } = params

    if (parsed.tree) {
        return {
            truncatedWith: 'tree-sitter',
            insertText: truncateParsedCompletion({
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
