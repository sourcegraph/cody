import type {
    AddedLineInfo,
    DecorationInfo,
    DecorationLineInfo,
    LineChange,
    ModifiedLineInfo,
    RemovedLineInfo,
    UnchangedLineInfo,
} from '../../../../src/autoedits/renderer/decorators/base'
import 'highlight.js/styles/github.css'
import hljs from 'highlight.js/lib/core'

import { SYNTAX_HIGHLIGHTING_LANGUAGES } from '../../../utils/highlight'

for (const [name, language] of Object.entries(SYNTAX_HIGHLIGHTING_LANGUAGES)) {
    hljs.registerLanguage(name, language)
}

/** A side-by-side line, representing left (original) and right (modified). */
export interface SideBySideColumn {
    html: string | null
    lineNumber: number | null
    type: DecorationLineInfo['type'] | 'empty'
}

export interface SideBySideLine {
    left: SideBySideColumn
    right: SideBySideColumn
}

/**
 * Produce an array of side-by-side lines from the DecorationInfo. Each line is
 * highlighted with highlight.js, then sub-string changes are wrapped in
 * <span class="bg-green-200"> or <span class="bg-red-200"> (as appropriate).
 */
export function buildSideBySideLines(
    decorationInfo: DecorationInfo,
    languageId: string
): SideBySideLine[] {
    const { addedLines, removedLines, modifiedLines, unchangedLines } = decorationInfo

    // Collect all lines in one array, each with a "sortKey" so we can order them.
    // Typically, we use originalLineNumber or modifiedLineNumber for sorting.
    type UnifiedLine =
        | (RemovedLineInfo & { sortKey: number })
        | (AddedLineInfo & { sortKey: number })
        | (ModifiedLineInfo & { sortKey: number })
        | (UnchangedLineInfo & { sortKey: number })

    const aggregator: UnifiedLine[] = []

    // Removed => sort by originalLineNumber
    aggregator.push(...removedLines.map(l => ({ ...l, sortKey: l.originalLineNumber })))
    // Added => sort by modifiedLineNumber
    aggregator.push(...addedLines.map(l => ({ ...l, sortKey: l.modifiedLineNumber })))
    // Unchanged => pick originalLineNumber for sorting
    aggregator.push(...unchangedLines.map(l => ({ ...l, sortKey: l.originalLineNumber })))
    // Modified => pick originalLineNumber
    aggregator.push(...modifiedLines.map(l => ({ ...l, sortKey: l.originalLineNumber })))

    // Sort them in ascending order
    aggregator.sort((a, b) => a.sortKey - b.sortKey)

    return aggregator.map(line => {
        switch (line.type) {
            case 'removed':
                return buildRemovedSideBySide(line, languageId)
            case 'added':
                return buildAddedSideBySide(line, languageId)
            case 'unchanged':
                return buildUnchangedSideBySide(line, languageId)
            case 'modified':
                return buildModifiedSideBySide(line, languageId)
        }
    })
}

/** Build a SideBySideLine for a removed line (exists on the left side only). */
export function buildRemovedSideBySide(
    line: RemovedLineInfo & { sortKey: number },
    languageId: string
): SideBySideLine {
    const text = line.text
    const leftHl = highlightLine(text, languageId)
    // No sub-line changes if line is purely removed
    return {
        left: {
            html: leftHl,
            lineNumber: line.originalLineNumber,
            type: 'removed',
        },
        right: {
            html: '',
            lineNumber: null,
            type: 'empty',
        },
    }
}

/** Build a SideBySideLine for an added line (exists on the right side only). */
export function buildAddedSideBySide(
    line: AddedLineInfo & { sortKey: number },
    languageId: string
): SideBySideLine {
    const text = line.text
    const rightHl = highlightLine(text, languageId)
    return {
        left: {
            html: '',
            lineNumber: null,
            type: 'empty',
        },
        right: {
            html: rightHl,
            lineNumber: line.modifiedLineNumber,
            type: 'added',
        },
    }
}

/** Unchanged line: identical text on both sides, no sub-line highlighting. */
export function buildUnchangedSideBySide(
    line: UnchangedLineInfo & { sortKey: number },
    languageId: string
): SideBySideLine {
    const text = line.text
    const hl = highlightLine(text, languageId)
    return {
        left: {
            html: hl,
            lineNumber: line.originalLineNumber,
            type: 'unchanged',
        },
        right: {
            html: hl,
            lineNumber: line.modifiedLineNumber,
            type: 'unchanged',
        },
    }
}

/**
 * Modified line: text has changed; we have oldText, newText, and sub-line changes
 * (in line.changes).  We must filter changes for the old text vs. new text.
 * **Importantly** we must also handle the line-based offset if your line changes
 * come in as file-wide offsets.
 */
export function buildModifiedSideBySide(
    line: ModifiedLineInfo & { sortKey: number },
    languageId: string
): SideBySideLine {
    const { oldText, newText, changes } = line

    // Filter/offset changes for the old side
    const leftLineChanges = getChangesForLine(changes, line.originalLineNumber, 'original')
    // Filter/offset changes for the new side
    const rightLineChanges = getChangesForLine(changes, line.modifiedLineNumber, 'modified')

    const oldHl = highlightLine(oldText, languageId)
    const newHl = highlightLine(newText, languageId)

    const decoratedLeft = decorateSyntaxHighlightedHTML(oldHl, leftLineChanges, 'original')
    const decoratedRight = decorateSyntaxHighlightedHTML(newHl, rightLineChanges, 'modified')

    return {
        left: {
            html: decoratedLeft,
            lineNumber: line.originalLineNumber,
            type: 'modified',
        },
        right: {
            html: decoratedRight,
            lineNumber: line.modifiedLineNumber,
            type: 'modified',
        },
    }
}

/**
 * Given a list of changes (which have file-wide ranges), extract only those relevant
 * to the specified line. Then adjust their range so the character offsets are
 * relative to the *start of that line* (0 = first character in that line).
 *
 * @param allChanges The entire array of sub-line changes from a ModifiedLineInfo
 * @param lineNumber The line number we are rendering (0-based)
 * @param whichSide 'original' or 'modified', determines whether to use originalRange or modifiedRange
 */
export function getChangesForLine(
    allChanges: LineChange[],
    lineNumber: number,
    side: 'original' | 'modified'
): LineChange[] {
    return allChanges
        .map(change => {
            const sideRange = side === 'original' ? change.originalRange : change.modifiedRange
            // If it doesn't affect this line, skip it
            if (sideRange.start.line > lineNumber || sideRange.end.line < lineNumber) {
                return null
            }
            // If it spans multiple lines, clamp the range to this line.
            // For single-line changes, it's enough to set:
            const c = { ...change }
            // Make a shallow copy so we don't mutate the original
            const r = side === 'original' ? { ...c.originalRange } : { ...c.modifiedRange }
            // Shift the line to 0-based for the substring
            // @ts-ignore
            r.start.character = Math.max(0, r.start.character)
            // @ts-ignore
            r.end.character = Math.max(r.start.character, r.end.character)

            if (side === 'original') {
                // @ts-ignore
                c.originalRange = r
            } else {
                // @ts-ignore
                c.modifiedRange = r
            }

            return c
        })
        .filter(Boolean) as LineChange[]
}

/**
 * Takes a plain-text line, runs highlight.js to produce HTML tokens.
 * If highlight.js doesn't support the language or fails, we fallback to escaping.
 */
export function highlightLine(text: string, languageId: string): string {
    if (!text) return ''
    try {
        const result = hljs.highlight(text, { language: languageId })
        return result.value
    } catch (e) {
        return escapeHTML(text)
    }
}

/**
 * Given highlight.js HTML for a single line, parse the DOM, walk text nodes,
 * and wrap sub-string changes with <span class="tw-bg-green-200"> or <span class="tw-bg-red-200">.
 * Then serialize back to an HTML string.
 *
 * This must be called per line with the sub-line changes that apply *only* to that line,
 * with character offsets relative to 0 at line start.
 */
export function decorateSyntaxHighlightedHTML(
    hljsHtml: string, // The HTML string with syntax highlighting from highlight.js
    changes: LineChange[], // Array of changes (inserts/deletes) that apply to this line
    side: 'original' | 'modified' // Which side we're decorating: 'original' (left) or 'modified' (right)
): string {
    // If no changes to apply, return the original HTML
    if (!changes || changes.length === 0) {
        return hljsHtml
    }

    // Sort changes by the correct side's .start.character to process them in order
    const sorted = [...changes].sort((a, b) => {
        const aRange = side === 'original' ? a.originalRange : a.modifiedRange
        const bRange = side === 'original' ? b.originalRange : b.modifiedRange
        return aRange.start.character - bRange.start.character
    })

    // Parse the highlight.js HTML to manipulate the DOM
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div>${hljsHtml}</div>`, 'text/html')

    let globalOffset = 0 // Tracks the current character position in the overall text
    let changeIndex = 0 // Tracks which change we're currently processing
    let currentChange = sorted[0] || null // The current change being processed

    // Recursive function to walk the DOM nodes
    function walk(node: ChildNode) {
        // Only process text nodes directly; for element nodes, just process their children
        if (node.nodeType !== Node.TEXT_NODE) {
            const children = Array.from(node.childNodes)

            for (const child of children) {
                walk(child)
            }

            return
        }

        const nodeText = node.textContent ?? '' // The text content of the current node
        const nodeLength = nodeText.length // Length of the text content
        const fragment = doc.createDocumentFragment() // Fragment to build the modified content
        let consumed = 0 // Tracks how many characters we've processed in this text node

        // Process the text node until we've consumed all its text
        while (consumed < nodeLength) {
            // If we've processed all changes, just append the remaining text
            if (!currentChange) {
                // No more changes; append the remainder as plain text
                const leftover = nodeText.slice(consumed)
                fragment.appendChild(doc.createTextNode(leftover))
                globalOffset += leftover.length
                consumed = nodeLength
                break
            }

            // Get the range for the current side (original or modified)
            const sideRange =
                side === 'original' ? currentChange.originalRange : currentChange.modifiedRange
            const startOffset = sideRange.start.character // Where the change begins
            const endOffset = sideRange.end.character // Where the change ends

            // If we've already passed this change entirely, move to the next change
            if (globalOffset + consumed >= endOffset) {
                changeIndex++
                currentChange = sorted[changeIndex] || null
                continue
            }

            // If we haven't yet reached the change's start position, add the unmodified text
            if (globalOffset + consumed < startOffset) {
                const sliceEnd = Math.min(startOffset - (globalOffset + consumed), nodeLength - consumed)
                const textPortion = nodeText.slice(consumed, consumed + sliceEnd)
                fragment.appendChild(doc.createTextNode(textPortion))
                consumed += textPortion.length
            } else {
                // We are inside the change range - add the changed text with highlighting
                const sliceEnd = Math.min(endOffset - (globalOffset + consumed), nodeLength - consumed)
                const changedPortion = nodeText.slice(consumed, consumed + sliceEnd)
                consumed += sliceEnd

                // Create a span with appropriate background color for the changed text
                const span = doc.createElement('span')
                if (currentChange.type === 'insert' && side === 'modified') {
                    // Green background for insertions on the modified (right) side
                    span.classList.add('tw-bg-green-200')
                } else if (currentChange.type === 'delete' && side === 'original') {
                    // Red background for deletions on the original (left) side
                    span.classList.add('tw-bg-red-200')
                }
                // If `unchanged` or not applicable side, no highlight
                span.textContent = changedPortion
                fragment.appendChild(span)
            }
        }

        globalOffset += consumed
        // Replace the original node with our modified fragment
        node.replaceWith(fragment)
    }

    const children = Array.from(doc.childNodes)
    // Process all child nodes in the document
    for (const child of children) {
        walk(child)
    }

    // Return the updated HTML inside the wrapper div
    const wrapper = doc.querySelector('div')
    return wrapper ? wrapper.innerHTML : hljsHtml
}

/** Safely escape HTML if highlight.js fails. */
export function escapeHTML(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}
