import type * as React from 'react'
import { ContentMatch } from './types';

type Merge<P1 = {}, P2 = {}> = Omit<P1, keyof P2> & P2

export type ForwardReferenceExoticComponent<E, OwnProps> = React.ForwardRefExoticComponent<
    Merge<E extends React.ElementType ? React.ComponentPropsWithRef<E> : never, OwnProps & { as?: E }>
>

type PropsWithChildren<P> = P &
    ({ children?: React.ReactNode | undefined } | { children: (...args: any[]) => React.ReactNode })

export interface ForwardReferenceComponent<
    IntrinsicElementString,
    OwnProps = {}
    /**
     * Extends original type to ensure built in React types play nice
     * with polymorphic components still e.g. `React.ElementRef` etc.
     */
> extends ForwardReferenceExoticComponent<IntrinsicElementString, OwnProps> {
    /**
     * When `as` prop is passed, use this overload.
     * Merges original own props (without DOM props) and the inferred props
     * from `as` element with the own props taking precedence.
     *
     * We explicitly avoid `React.ElementType` and manually narrow the prop types
     * so that events are typed when using JSX.IntrinsicElements.
     */
        <As = IntrinsicElementString>(
        props: As extends ''
            ? { as: keyof JSX.IntrinsicElements }
            : As extends React.ComponentType<PropsWithChildren<infer P>>
                ? Merge<P, OwnProps & { as: As }>
                : As extends keyof JSX.IntrinsicElements
                    ? Merge<JSX.IntrinsicElements[As], OwnProps & { as: As }>
                    : never
    ): React.ReactElement | null
}

export type ObservableStatus = 'initial' | 'next' | 'completed' | 'error'

/**
 * Converts the number of repo stars into a string, formatted nicely for large numbers
 */
export const formatRepositoryStarCount = (repoStars?: number): string | undefined => {
    if (repoStars !== undefined) {
        if (repoStars > 1000) {
            return `${(repoStars / 1000).toFixed(1)}k`
        }
        return repoStars.toString()
    }
    return undefined
}

/**
 * Highlights match ranges within visibleRows, with support for highlighting match ranges that span multiple lines.
 * @param visibleRows the visible rows of the HTML table containing the code excerpt
 * @param startRow the row within the table where highlighting should begin
 * @param endRow the row within the table where highlighting should end
 * @param startRowIndex the index of startRow within visibleRows
 * @param endRowIndex the index of endRow within visibleRows
 * @param startCharacter the 0-based character offset from the beginning of startRow's text content where highlighting should begin
 * @param endCharacter the 0-based character offset from the beginning of endRow's text content where highlighting should end
 */
export function highlightNodeMultiline(
    visibleRows: NodeListOf<HTMLElement>,
    startRow: HTMLElement,
    endRow: HTMLElement,
    startRowIndex: number,
    endRowIndex: number,
    startCharacter: number,
    endCharacter: number
): void {
    // Take the lastChild of the row to select the code portion of the table row (each table row consists of the line number and code).
    const startRowCode = startRow.querySelector('td:last-of-type') as HTMLTableCellElement
    const endRowCode = endRow.querySelector('td:last-of-type') as HTMLTableCellElement

    // Highlight a single-line match
    if (endRowIndex === startRowIndex) {
        return highlightNode(startRowCode, startCharacter, endCharacter - startCharacter)
    }

    // Otherwise the match is a multiline match. Highlight from the start character through to the end character.
    highlightNode(startRowCode, startCharacter, startRowCode.textContent!.length - startCharacter)
    for (let currRowIndex = startRowIndex + 1; currRowIndex < endRowIndex; ++currRowIndex) {
        if (visibleRows[currRowIndex]) {
            const currRowCode = visibleRows[currRowIndex].lastChild as HTMLTableCellElement
            highlightNode(currRowCode, 0, currRowCode.textContent!.length)
        }
    }
    highlightNode(endRowCode, 0, endCharacter)
}

/**
 * Highlights a node using recursive node walking.
 * @param node the node to highlight
 * @param start the current character position (starts at 0).
 * @param length the number of characters to highlight.
 */
export function highlightNode(node: HTMLElement, start: number, length: number): void {
    if (start < 0 || length <= 0 || start >= node.textContent!.length) {
        return
    }

    // return if length is invalid/longer than remaining characters between start and end
    if (length > node.textContent!.length - start) {
        return
    }
    // We want to treat text nodes as walkable so they can be highlighted. Wrap these in a span and
    // replace them in the DOM.
    if (node.nodeType === Node.TEXT_NODE && node.textContent !== null) {
        const span = document.createElement('span')
        span.innerHTML = node.textContent
        node.parentNode!.replaceChild(span, node)
        node = span
    }
    node.classList.add('annotated-selection-match')
    highlightNodeHelper(node, 0, start, length)
}

interface HighlightResult {
    highlightingCompleted: boolean
    charsConsumed: number
    charsHighlighted: number
}

/**
 * Highlights a node using recursive node walking.
 * @param currentNode the current node being walked.
 * @param currentOffset the current character position (starts at 0).
 * @param start the offset character where highlting starts.
 * @param length the number of characters to highlight.
 */
function highlightNodeHelper(
    currentNode: HTMLElement,
    currentOffset: number,
    start: number,
    length: number
): HighlightResult {
    if (length === 0) {
        return { highlightingCompleted: true, charsConsumed: 0, charsHighlighted: 0 }
    }

    const origOffset = currentOffset
    const numberChildNodes = currentNode.childNodes.length

    let charsHighlighted = 0

    for (let index = 0; index < numberChildNodes; ++index) {
        if (currentOffset >= start + length) {
            return { highlightingCompleted: true, charsConsumed: 0, charsHighlighted: 0 }
        }
        const isLastNode = index === currentNode.childNodes.length - 1
        const child = currentNode.childNodes[index]

        switch (child.nodeType) {
            case Node.TEXT_NODE: {
                const nodeText = child.textContent!

                // Unpack the string to be sliced into an array of code points before doing the slice.
                // This allows match range highlighting to continue to work when Unicode characters (such as emojis)
                // are present in a matched line.
                const unicodeAwareSlice = (text: string, start: number, end: number): string =>
                    text.slice(start, end)

                // Split the text node into a range before the highlight, a range overlapping with
                // the highlight, and a range after the highlight. These ranges can be zero-length
                const preHighlightedRange = unicodeAwareSlice(nodeText, 0, Math.max(0, start - currentOffset))
                const highlightedRange = unicodeAwareSlice(
                    nodeText,
                    Math.max(0, start - currentOffset),
                    start - currentOffset + length
                )
                const postHighlightedRange = unicodeAwareSlice(
                    nodeText,
                    start - currentOffset + length,
                    nodeText.length + 1
                )

                // Create new nodes for each of the ranges with length > 0
                const newNodes: Node[] = []

                if (preHighlightedRange) {
                    newNodes.push(document.createTextNode(preHighlightedRange))
                }

                if (highlightedRange) {
                    const highlight = document.createElement('span')
                    /*
                        a11y-ignore
                        Rule: "color-contrast" (Elements must have sufficient color contrast)
                        GitHub issue: https://github.com/sourcegraph/sourcegraph/issues/33343
                    */
                    highlight.className = 'match-highlight a11y-ignore'
                    highlight.append(document.createTextNode(highlightedRange))
                    newNodes.push(highlight)
                }

                if (postHighlightedRange) {
                    newNodes.push(document.createTextNode(postHighlightedRange))
                }

                let newNode: Node
                if (newNodes.length === 0) {
                    newNode = document.createTextNode('')
                } else if (newNodes.length === 1) {
                    // If we only have one new node, no need to wrap it in a containing span
                    newNode = newNodes[0]
                } else {
                    // If there are more than one new nodes, wrap them in a span
                    const containerNode = document.createElement('span')
                    containerNode.append(...newNodes)
                    /*
                        a11y-ignore
                        Rule: "color-contrast" (Elements must have sufficient color contrast)
                        GitHub issue: https://github.com/sourcegraph/sourcegraph/issues/33343
                    */
                    containerNode.className = 'a11y-ignore'
                    newNode = containerNode
                }

                // Remove the original child and replace it with the new node
                child.remove()
                if (currentNode.childNodes.length === 0 || isLastNode) {
                    if (currentNode.classList.contains('match-highlight')) {
                        // Nothing to do; it's already highlighted.
                        currentNode.append(child)
                    } else {
                        currentNode.append(newNode)
                    }
                } else {
                    currentNode.insertBefore(newNode, currentNode.childNodes[index] || currentNode.firstChild)
                }

                // Count highlighted characters in terms of code points, not bytes
                currentOffset += nodeText.length
                charsHighlighted += highlightedRange.length
                if (highlightedRange.length > 0 && postHighlightedRange.length > 0) {
                    return {
                        highlightingCompleted: true,
                        charsConsumed: nodeText.length,
                        charsHighlighted: highlightedRange.length,
                    }
                }

                break
            }

            case Node.ELEMENT_NODE: {
                const elementNode = child as HTMLElement
                const result = highlightNodeHelper(
                    elementNode,
                    currentOffset,
                    start + charsHighlighted,
                    length - charsHighlighted
                )
                if (result.highlightingCompleted) {
                    return result
                }
                currentOffset += result.charsConsumed
                charsHighlighted += result.charsHighlighted
                break
            }
        }
    }

    return { highlightingCompleted: false, charsConsumed: currentOffset - origOffset, charsHighlighted }
}

export function getFileMatchUrl(fileMatch: ContentMatch): string {
    const revision = getRevision(fileMatch.branches, fileMatch.commit)
    const encodedFilePath = fileMatch.path.split('/').map(encodeURIComponent).join('/')
    return `/${fileMatch.repository}${revision ? '@' + revision : ''}/-/blob/${encodedFilePath}`
}

export function getRevision(branches?: string[], version?: string): string {
    let revision = ''
    if (branches) {
        const branch = branches[0]
        if (branch !== '') {
            revision = branch
        }
    } else if (version) {
        revision = version
    }

    return revision
}
