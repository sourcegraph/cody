import { DocumentOffsets } from '../agent/offsets'
import { Position, TextDocument } from '../agent/protocol'

import { DocumentContext } from './types'
import { getNextNonEmptyLine, getPrevNonEmptyLine } from './utils/text-utils'

/**
 * Get the current document context based on the cursor position in the current document.
 *
 * This function is meant to provide a context around the current position in the document,
 * including a prefix, a suffix, the previous line, the previous non-empty line, and the next non-empty line.
 * The prefix and suffix are obtained by looking around the current position up to a max length
 * defined by `maxPrefixLength` and `maxSuffixLength` respectively. If the length of the entire
 * document content in either direction is smaller than these parameters, the entire content will be used.
 *w
 *
 * @param document - A `TextDocument` object, the document in which to find the context.
 * @param position - A `Position` object, the position in the document from which to find the context.
 * @param maxPrefixLength - A number representing the maximum length of the prefix to get from the document.
 * @param maxSuffixLength - A number representing the maximum length of the suffix to get from the document.
 *
 * @returns An object containing the current document context or null if there are no lines in the document.
 */
export function getCurrentDocContext(
    document: TextDocument,
    position: Position,
    maxPrefixLength: number,
    maxSuffixLength: number
): DocumentContext | null {
    if (document === undefined || document.content === undefined || document.selection === undefined) {
        return null
    }
    const offsets = new DocumentOffsets(document)
    const offset = offsets.offset(position)

    const prefixLines = document.content.slice(0, offset).split('\n')

    if (prefixLines.length === 0) {
        console.error('no lines')
        return null
    }

    const suffixLines = document.content.slice(offset, document.content.length).split('\n')

    const currentLinePrefix = prefixLines[prefixLines.length - 1]

    let prefix: string
    if (offset > maxPrefixLength) {
        let total = 0
        let startLine = prefixLines.length
        for (let i = prefixLines.length - 1; i >= 0; i--) {
            if (total + prefixLines[i].length > maxPrefixLength) {
                break
            }
            startLine = i
            total += prefixLines[i].length
        }
        prefix = prefixLines.slice(startLine).join('\n')
    } else {
        prefix = document.content.slice(0, offset)
    }
    const prevNonEmptyLine = getPrevNonEmptyLine(prefix)

    let totalSuffix = 0
    let endLine = 0
    for (let i = 0; i < suffixLines.length; i++) {
        if (totalSuffix + suffixLines[i].length > maxSuffixLength) {
            break
        }
        endLine = i + 1
        totalSuffix += suffixLines[i].length
    }
    const suffix = suffixLines.slice(0, endLine).join('\n')
    const nextNonEmptyLine = getNextNonEmptyLine(suffix)

    const currentLineSuffix = suffixLines[0]

    return {
        prefix,
        suffix,
        currentLinePrefix,
        currentLineSuffix,
        prevNonEmptyLine,
        nextNonEmptyLine,
    }
}
