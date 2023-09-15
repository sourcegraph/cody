import { TextDocument } from 'vscode'

import { SupportedLanguage } from '../tree-sitter/grammars'
import { getCachedParseTreeForDocument } from '../tree-sitter/parse-tree-cache'

import { ParsedCompletion } from './parse-completion'

interface CompletionContext {
    completion: ParsedCompletion
    document: TextDocument
}

export const MULTILINE_TRUNCATION_SUPPORTED_LANGUAGES: Set<string> = new Set([
    SupportedLanguage.JavaScript,
    SupportedLanguage.TypeScript,
    SupportedLanguage.JSX,
    SupportedLanguage.TSX,
])

// Supports Javascript and Typescript only.
const BLOCKS_QUERY = `
    [(class_declaration)
    (function_declaration)
    (generator_function_declaration)
    (arrow_function)
    (method_definition)
    (try_statement)
    (switch_statement)
    (object)
    (if_statement)
    (ambient_declaration)
    (object_type)
    (statement_block)] @blocks
`

/**
 * Truncates the `insertText` of a `ParsedCompletion` based on the syntactic structure
 * of the code in a given `TextDocument`. Currently supports only JavaScript and TypeScript.
 *
 * Uses `tree-sitter` to query specific code blocks for contextual truncation.
 * Returns the original `insertText` if no truncation is needed or if syntactic post-processing isn't enabled.
 *
 * TODO(tree-sitter): Extend to support multiple languages.
 */
export function truncateParsedCompletion(context: CompletionContext): string {
    const { completion, document } = context

    const parseTreeCache = getCachedParseTreeForDocument(document)

    if (!completion.tree || !parseTreeCache) {
        throw new Error('Expected completion and document to have tree-sitter data for truncation')
    }

    const { tree, points } = completion

    const query = parseTreeCache.parser.getLanguage().query(BLOCKS_QUERY)
    const blockCaptures = query.captures(tree.rootNode, points?.trigger || points?.start, points?.end)

    if (blockCaptures.length > 0) {
        const [{ node }] = blockCaptures
        const overlap = findLargestSuffixPrefixOverlap(node.text, completion.insertText)

        if (overlap) {
            return overlap
        }
    }

    return completion.insertText
}

/**
 * Finds the maximum suffix-prefix overlap between two strings.
 */
function findLargestSuffixPrefixOverlap(left: string, right: string): string | null {
    let overlap = ''

    for (let i = 1; i <= Math.min(left.length, right.length); i++) {
        const suffix = left.slice(left.length - i)
        const prefix = right.slice(0, i)

        if (suffix === prefix) {
            overlap = suffix
        }
    }

    if (overlap.length === 0) {
        return null
    }

    return overlap
}
