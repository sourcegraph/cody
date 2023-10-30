import { Position, TextDocument } from 'vscode'

import { DocumentContext } from './get-current-doc-context'
import { getLanguageConfig } from './language'
import {
    FUNCTION_KEYWORDS,
    FUNCTION_OR_METHOD_INVOCATION_REGEX,
    indentation,
    OPENING_BRACKET_REGEX,
} from './text-processing'
import { execQueryWrapper } from './tree-sitter/query-sdk'

interface DetectMultilineParams {
    docContext: Omit<DocumentContext, 'multilineTrigger'>
    document: TextDocument
    enableExtendedTriggers: boolean
    syntacticTriggers?: boolean
    cursorPosition: Pick<Position, 'line' | 'character'>
}

export function detectMultiline(params: DetectMultilineParams): string | null {
    const { syntacticTriggers, docContext, document, enableExtendedTriggers, cursorPosition } = params
    const { prefix, prevNonEmptyLine, nextNonEmptyLine, currentLinePrefix, currentLineSuffix } = docContext

    const blockStart = getLanguageConfig(document.languageId)?.blockStart
    const isBlockStartActive = blockStart && prefix.trimEnd().endsWith(blockStart)

    if (syntacticTriggers && isBlockStartActive) {
        const singleLineTriggers = execQueryWrapper(document, cursorPosition, 'getSinglelineTrigger')

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
