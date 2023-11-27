import { getLanguageConfig } from '../tree-sitter/language'

import { DocumentDependentContext, LinesContext } from './get-current-doc-context'
import { completionPostProcessLogger } from './post-process-logger'
import {
    FUNCTION_KEYWORDS,
    FUNCTION_OR_METHOD_INVOCATION_REGEX,
    indentation,
    OPENING_BRACKET_REGEX,
} from './text-processing'

interface DetectMultilineParams {
    docContext: LinesContext & DocumentDependentContext
    languageId: string
    dynamicMultlilineCompletions?: boolean
}

export function detectMultiline(params: DetectMultilineParams): string | null {
    const { docContext, languageId, dynamicMultlilineCompletions } = params
    const {
        prefix,
        prevNonEmptyLine,
        nextNonEmptyLine,
        currentLinePrefix,
        currentLineSuffix,
        completionPostProcessId,
    } = docContext

    const blockStart = getLanguageConfig(languageId)?.blockStart
    const isBlockStartActive = blockStart && prefix.trimEnd().endsWith(blockStart)

    const checkInvocation =
        currentLineSuffix.trim().length > 0 ? currentLinePrefix + currentLineSuffix : currentLinePrefix

    // Don't fire multiline completion for method or function invocations
    // see https://github.com/sourcegraph/cody/discussions/358#discussioncomment-6519606
    if (
        !dynamicMultlilineCompletions &&
        !currentLinePrefix.trim().match(FUNCTION_KEYWORDS) &&
        checkInvocation.match(FUNCTION_OR_METHOD_INVOCATION_REGEX)
    ) {
        return null
    }
    completionPostProcessLogger.info({ completionPostProcessId, stage: 'detectMultiline', text: currentLinePrefix })

    const openingBracketMatch = currentLinePrefix.match(OPENING_BRACKET_REGEX)
    if (
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
