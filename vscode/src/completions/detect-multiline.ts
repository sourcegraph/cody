import * as vscode from 'vscode'

import { DocumentContext } from './get-current-doc-context'
import { getLanguageConfig } from './language'
import {
    FUNCTION_KEYWORDS,
    FUNCTION_OR_METHOD_INVOCATION_REGEX,
    indentation,
    OPENING_BRACKET_REGEX,
} from './text-processing'
import { getCachedParseTreeForDocument } from './tree-sitter/parse-tree-cache'
import { getDocumentQuerySDK } from './tree-sitter/query-sdk'

export function detectMultiline(
    docContext: Omit<DocumentContext, 'multilineTrigger'>,
    document: vscode.TextDocument,
    enableExtendedTriggers: boolean
): string | null {
    const { prefix, prevNonEmptyLine, nextNonEmptyLine, currentLinePrefix, currentLineSuffix } = docContext

    const parseTreeCache = getCachedParseTreeForDocument(document)
    const documentQuerySDK = getDocumentQuerySDK(document.languageId)
    const blockStart = getLanguageConfig(document.languageId)?.blockStart
    const isBlockStartActive = blockStart && prefix.trimEnd().endsWith(blockStart)

    if (parseTreeCache && documentQuerySDK && isBlockStartActive) {
        const triggerPosition = document.positionAt(docContext.prefix.lastIndexOf(blockStart))

        const queryStartPoint = {
            row: triggerPosition.line,
            column: triggerPosition.character,
        }

        const queryEndPoint = {
            row: triggerPosition.line,
            // Querying around one character after trigger position.
            column: triggerPosition.character + 1,
        }

        const singleLineTriggers = documentQuerySDK.queries.singlelineTriggers.getEnclosingTrigger(
            parseTreeCache.tree.rootNode,
            queryStartPoint,
            queryEndPoint
        )

        // Don't trigger multiline completion if single line trigger is found.
        if (singleLineTriggers.length > 0) {
            return null
        }
    }

    const checkInvocation =
        currentLineSuffix.trim().length > 0 ? currentLinePrefix + currentLineSuffix : currentLinePrefix

    // Don't fire multiline completion for method or function invocations
    // see https://github.com/sourcegraph/cody/discussions/358#discussioncomment-6519606
    if (
        !currentLinePrefix.trim().match(FUNCTION_KEYWORDS) &&
        checkInvocation.match(FUNCTION_OR_METHOD_INVOCATION_REGEX)
    ) {
        return null
    }

    const openingBracketMatch = currentLinePrefix.match(OPENING_BRACKET_REGEX)
    if (
        enableExtendedTriggers &&
        openingBracketMatch &&
        // Only trigger multiline suggestions when the next non-empty line is indented less
        // than the block start line (the newly created block is empty).
        indentation(currentLinePrefix) >= indentation(nextNonEmptyLine)
    ) {
        return openingBracketMatch[0]
    }

    if (
        currentLinePrefix.trim() === '' &&
        currentLineSuffix.trim() === '' &&
        // Only trigger multiline suggestions for the beginning of blocks
        isBlockStartActive &&
        // Only trigger multiline suggestions when the new current line is indented
        indentation(prevNonEmptyLine) < indentation(currentLinePrefix) &&
        // Only trigger multiline suggestions when the next non-empty line is indented less
        // than the block start line (the newly created block is empty).
        indentation(prevNonEmptyLine) >= indentation(nextNonEmptyLine)
    ) {
        return blockStart
    }

    return null
}
