import { DocumentContext } from './get-current-doc-context'
import { getLanguageConfig } from './language'
import {
    FUNCTION_KEYWORDS,
    FUNCTION_OR_METHOD_INVOCATION_REGEX,
    indentation,
    OPENING_BRACKET_REGEX,
} from './text-processing'

export function detectMultiline(
    {
        prefix,
        prevNonEmptyLine,
        currentLinePrefix,
        currentLineSuffix,
    }: Pick<DocumentContext, 'prefix' | 'prevNonEmptyLine' | 'currentLinePrefix' | 'currentLineSuffix'>,
    languageId: string,
    enableExtendedTriggers: boolean
): boolean {
    const config = getLanguageConfig(languageId)
    if (!config) {
        return false
    }

    const checkInvocation =
        currentLineSuffix.trim().length > 0 ? currentLinePrefix + currentLineSuffix : currentLinePrefix

    // Don't fire multiline completion for method or function invocations
    // see https://github.com/sourcegraph/cody/discussions/358#discussioncomment-6519606
    if (
        !currentLinePrefix.trim().match(FUNCTION_KEYWORDS) &&
        checkInvocation.match(FUNCTION_OR_METHOD_INVOCATION_REGEX)
    ) {
        return false
    }

    if (enableExtendedTriggers && currentLinePrefix.match(OPENING_BRACKET_REGEX)) {
        return true
    }

    if (
        currentLinePrefix.trim() === '' &&
        currentLineSuffix.trim() === '' &&
        // Only trigger multiline suggestions for the beginning of blocks
        prefix.trim().at(prefix.trim().length - config.blockStart.length) === config.blockStart &&
        // Only trigger multiline suggestions when the new current line is indented
        indentation(prevNonEmptyLine) < indentation(currentLinePrefix)
    ) {
        return true
    }

    return false
}
