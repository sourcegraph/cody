import { type FC, useCallback, useLayoutEffect, useMemo, useState } from 'react'

import { clsx } from 'clsx'

import { highlightNodeMultiline } from '../highlights'
import { Code } from './Code'

import styles from './CodeExcerpt.module.css'

interface Props {
    commitID: string
    filePath: string
    highlightRanges: HighlightRange[]
    /** The 0-based (inclusive) line number that this code excerpt starts at */
    startLine: number
    /** The 0-based (exclusive) line number that this code excerpt ends at */
    endLine: number
    className?: string
    plaintextLines: string[]
    highlightedLines?: string[]
    onCopy?: () => void
    onLineClick?: (line: number) => void
}

interface HighlightRange {
    /**
     * The 0-based line number where this highlight range begins
     */
    startLine: number
    /**
     * The 0-based character offset from the beginning of startLine where this highlight range begins
     */
    startCharacter: number
    /**
     * The 0-based line number where this highlight range ends
     */
    endLine: number
    /**
     * The 0-based character offset from the beginning of endLine where this highlight range ends
     */
    endCharacter: number
}

/**
 * A code excerpt that displays syntax highlighting and match range highlighting.
 */
export const CodeExcerpt: FC<Props> = props => {
    const {
        plaintextLines,
        highlightedLines,
        startLine,
        endLine,
        highlightRanges,
        className,
        onLineClick,
    } = props

    const [tableContainerElement, setTableContainerElement] = useState<HTMLElement | null>(null)

    const handleLineClick = useCallback(
        (e: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
            if (e.target instanceof HTMLElement && e.target.tagName === 'TD') {
                const line = e.target.getAttribute('data-line')
                if (line) {
                    onLineClick?.(Number.parseInt(line))
                }
            }
        },
        [onLineClick]
    )

    const table = useMemo(
        () =>
            highlightedLines ? (
                <table
                    // biome-ignore lint/security/noDangerouslySetInnerHtml:
                    dangerouslySetInnerHTML={{ __html: highlightedLines.join('') }}
                    onClick={handleLineClick}
                    onKeyDown={handleLineClick}
                />
            ) : (
                <table>
                    <tbody>
                        {plaintextLines.map((line, i) => (
                            <tr
                                // biome-ignore lint/suspicious/noArrayIndexKey:
                                key={startLine + i}
                            >
                                <td
                                    className="line hover:tw-underline tw-cursor-pointer"
                                    data-line={startLine + i + 1}
                                    onClick={handleLineClick}
                                    onKeyDown={handleLineClick}
                                />
                                <td className="code">
                                    <span className="hl-text hl-plain">{line}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ),
        [plaintextLines, highlightedLines, startLine, handleLineClick]
    )

    // Highlight the search matches
    // biome-ignore lint/correctness/useExhaustiveDependencies:
    useLayoutEffect(() => {
        if (tableContainerElement) {
            const visibleRows = tableContainerElement.querySelectorAll<HTMLTableRowElement>('table tr')
            for (const highlight of highlightRanges) {
                // Select the HTML rows in the excerpt that correspond to the first and last line to be highlighted.
                // highlight.startLine is the 0-indexed line number in the code file, and startLine is the 0-indexed
                // line number of the first visible line in the excerpt. So, subtract startLine
                // from highlight.startLine to get the correct 0-based index in visibleRows that holds the HTML row
                // where highlighting should begin. Subtract startLine from highlight.endLine to get the correct 0-based
                // index in visibleRows that holds the HTML row where highlighting should end.
                const startRowIndex = highlight.startLine - startLine
                const endRowIndex = highlight.endLine - startLine
                const startRow = visibleRows[startRowIndex]
                const endRow = visibleRows[endRowIndex]
                if (startRow && endRow) {
                    highlightNodeMultiline(
                        visibleRows,
                        startRow,
                        endRow,
                        startRowIndex,
                        endRowIndex,
                        highlight.startCharacter,
                        highlight.endCharacter
                    )
                }
            }
        }
    }, [highlightRanges, startLine, endLine, tableContainerElement, table])

    return (
        <Code className={clsx(styles.codeExcerpt, className)} data-code-excerpt={true}>
            <div ref={setTableContainerElement}>{table}</div>
        </Code>
    )
}
