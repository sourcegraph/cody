import { DocumentContext } from './get-current-doc-context'
import { getLanguageConfig } from './language'
import {
    FUNCTION_KEYWORDS,
    FUNCTION_OR_METHOD_INVOCATION_REGEX,
    indentation,
    OPENING_BRACKET_REGEX,
} from './text-processing'

export type DetectMultilineResult =
    | {
          multiline: true
          multilineTrigger: string
      }
    | {
          multiline: false
          multilineTrigger: undefined
      }

const MULTILINE_DISABLED_RESULT: DetectMultilineResult = { multiline: false, multilineTrigger: undefined }

export function detectMultiline(
    docContext: Omit<DocumentContext, 'multiline' | 'multilineTrigger'>,
    languageId: string,
    enableExtendedTriggers: boolean
): DetectMultilineResult {
    const { prefix, prevNonEmptyLine, nextNonEmptyLine, currentLinePrefix, currentLineSuffix } = docContext

    const languageConfig = getLanguageConfig(languageId)
    if (!languageConfig) {
        return MULTILINE_DISABLED_RESULT
    }

    const checkInvocation =
        currentLineSuffix.trim().length > 0 ? currentLinePrefix + currentLineSuffix : currentLinePrefix

    // Don't fire multiline completion for method or function invocations
    // see https://github.com/sourcegraph/cody/discussions/358#discussioncomment-6519606
    if (
        !currentLinePrefix.trim().match(FUNCTION_KEYWORDS) &&
        checkInvocation.match(FUNCTION_OR_METHOD_INVOCATION_REGEX)
    ) {
        return MULTILINE_DISABLED_RESULT
    }

    const openingBracketMatch = currentLinePrefix.match(OPENING_BRACKET_REGEX)
    if (enableExtendedTriggers && openingBracketMatch) {
        return {
            multiline: true,
            multilineTrigger: openingBracketMatch[0],
        }
    }

    const { blockStart } = languageConfig

    if (
        currentLinePrefix.trim() === '' &&
        currentLineSuffix.trim() === '' &&
        // Only trigger multiline suggestions for the beginning of blocks
        prefix.trimEnd().endsWith(blockStart) &&
        // Only trigger multiline suggestions when the new current line is indented
        indentation(prevNonEmptyLine) < indentation(currentLinePrefix) &&
        // Only trigger multiline suggestions when the next non-empty line is indented less
        // than the block start line (the newly created block is empty).
        indentation(prevNonEmptyLine) >= indentation(nextNonEmptyLine)
    ) {
        return {
            multiline: true,
            multilineTrigger: blockStart,
        }
    }

    return MULTILINE_DISABLED_RESULT
}
