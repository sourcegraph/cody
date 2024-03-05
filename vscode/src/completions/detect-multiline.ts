import { Position } from 'vscode'

import { addAutocompleteDebugEvent } from '../services/open-telemetry/debug-utils'
import { getLanguageConfig } from '../tree-sitter/language'

import type { DocumentDependentContext, LinesContext } from './get-current-doc-context'
import {
    FUNCTION_KEYWORDS,
    FUNCTION_OR_METHOD_INVOCATION_REGEX,
    OPENING_BRACKET_REGEX,
    getLastLine,
    indentation,
    lines,
} from './text-processing'

interface DetectMultilineParams {
    docContext: LinesContext & DocumentDependentContext
    languageId: string
    dynamicMultilineCompletions: boolean
    position: Position
}

interface DetectMultilineResult {
    multilineTrigger: string | null
    multilineTriggerPosition: Position | null
}

export function endsWithBlockStart(text: string, languageId: string): string | null {
    const blockStart = getLanguageConfig(languageId)?.blockStart
    return blockStart && text.trimEnd().endsWith(blockStart) ? blockStart : null
}

// Languages with more than 100 multiline completions in the last month and CAR > 20%:
// https://sourcegraph.looker.com/explore/sourcegraph/cody?qid=JBItVt6VFMlCtMa9KOBmjh&origin_space=562
const LANGUAGES_WITH_MULTILINE_SUPPORT = [
    'astro',
    'c',
    'cpp',
    'csharp',
    'css',
    'dart',
    'elixir',
    'go',
    'html',
    'java',
    'javascript',
    'javascriptreact',
    'php',
    'python',
    'rust',
    'svelte',
    'typescript',
    'typescriptreact',
    'vue',
]

export function detectMultiline(params: DetectMultilineParams): DetectMultilineResult {
    const { docContext, languageId, dynamicMultilineCompletions, position } = params
    const { prefix, prevNonEmptyLine, nextNonEmptyLine, currentLinePrefix, currentLineSuffix } =
        docContext
    const isMultilineSupported = LANGUAGES_WITH_MULTILINE_SUPPORT.includes(languageId)

    const blockStart = endsWithBlockStart(prefix, languageId)
    const isBlockStartActive = Boolean(blockStart)

    const currentLineText =
        currentLineSuffix.trim().length > 0 ? currentLinePrefix + currentLineSuffix : currentLinePrefix

    const isMethodOrFunctionInvocation =
        !currentLinePrefix.trim().match(FUNCTION_KEYWORDS) &&
        currentLineText.match(FUNCTION_OR_METHOD_INVOCATION_REGEX)

    // Don't fire multiline completion for method or function invocations
    // see https://github.com/sourcegraph/cody/discussions/358#discussioncomment-6519606
    // Don't fire multiline completion for unsupported languages.
    if ((!dynamicMultilineCompletions && isMethodOrFunctionInvocation) || !isMultilineSupported) {
        addAutocompleteDebugEvent('detectMultiline', {
            languageId,
            dynamicMultilineCompletions,
            isMethodOrFunctionInvocation,
        })

        return {
            multilineTrigger: null,
            multilineTriggerPosition: null,
        }
    }

    const openingBracketMatch = getLastLine(prefix.trimEnd()).match(OPENING_BRACKET_REGEX)

    const isSameLineOpeningBracketMatch =
        currentLinePrefix.trim() !== '' &&
        openingBracketMatch &&
        // Only trigger multiline suggestions when the next non-empty line is indented less
        // than the block start line (the newly created block is empty).
        indentation(currentLinePrefix) >= indentation(nextNonEmptyLine)

    const isNewLineOpeningBracketMatch =
        currentLinePrefix.trim() === '' &&
        currentLineSuffix.trim() === '' &&
        openingBracketMatch &&
        // Only trigger multiline suggestions when the next non-empty line is indented the same or less
        indentation(prevNonEmptyLine) < indentation(currentLinePrefix) &&
        // Only trigger multiline suggestions when the next non-empty line is indented less
        // than the block start line (the newly created block is empty).
        indentation(prevNonEmptyLine) >= indentation(nextNonEmptyLine)

    if ((dynamicMultilineCompletions && isNewLineOpeningBracketMatch) || isSameLineOpeningBracketMatch) {
        addAutocompleteDebugEvent('detectMultiline', {
            dynamicMultilineCompletions,
            isNewLineOpeningBracketMatch,
            isSameLineOpeningBracketMatch,
        })

        return {
            multilineTrigger: openingBracketMatch[0],
            multilineTriggerPosition: getPrefixLastNonEmptyCharPosition(prefix, position),
        }
    }

    const nonEmptyLineEndsWithBlockStart =
        currentLinePrefix.length > 0 &&
        isBlockStartActive &&
        indentation(currentLinePrefix) >= indentation(nextNonEmptyLine)

    const isEmptyLineAfterBlockStart =
        currentLinePrefix.trim() === '' &&
        currentLineSuffix.trim() === '' &&
        // Only trigger multiline suggestions for the beginning of blocks
        isBlockStartActive &&
        // Only trigger multiline suggestions when the next non-empty line is indented the same or less
        indentation(prevNonEmptyLine) < indentation(currentLinePrefix) &&
        // Only trigger multiline suggestions when the next non-empty line is indented less
        // than the block start line (the newly created block is empty).
        indentation(prevNonEmptyLine) >= indentation(nextNonEmptyLine)

    if ((dynamicMultilineCompletions && nonEmptyLineEndsWithBlockStart) || isEmptyLineAfterBlockStart) {
        addAutocompleteDebugEvent('detectMultiline', {
            dynamicMultilineCompletions,
            nonEmptyLineEndsWithBlockStart,
            isEmptyLineAfterBlockStart,
        })

        return {
            multilineTrigger: blockStart,
            multilineTriggerPosition: getPrefixLastNonEmptyCharPosition(prefix, position),
        }
    }

    addAutocompleteDebugEvent('detectMultiline', {
        dynamicMultilineCompletions,
        nonEmptyLineEndsWithBlockStart,
        isEmptyLineAfterBlockStart,
        isNewLineOpeningBracketMatch,
        isSameLineOpeningBracketMatch,
    })

    return {
        multilineTrigger: null,
        multilineTriggerPosition: null,
    }
}

/**
 * Precalculate the multiline trigger position based on `prefix` and `cursorPosition` to be
 * able to change it during streaming to the end of the first line of the completion.
 */
function getPrefixLastNonEmptyCharPosition(prefix: string, cursorPosition: Position): Position {
    const trimmedPrefix = prefix.trimEnd()
    const diffLength = prefix.length - trimmedPrefix.length
    if (diffLength === 0) {
        return cursorPosition.translate(0, -1)
    }

    const prefixDiff = prefix.slice(-diffLength)
    return new Position(
        cursorPosition.line - (lines(prefixDiff).length - 1),
        getLastLine(trimmedPrefix).length - 1
    )
}
