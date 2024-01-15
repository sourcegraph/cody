/* eslint-disable no-sync */
import fs from 'fs'
import path from 'path'

import dedent from 'dedent'
import { findLast } from 'lodash'
import { expect } from 'vitest'
import { type default as Parser, type Point, type SyntaxNode } from 'web-tree-sitter'

import { type SupportedLanguage } from '../grammars'
import { getLanguageConfig } from '../language'

interface CommentSymbolInfo {
    delimiter: string
    indent: string
    separator: string
}

const SNIPPET_SEPARATOR = '------------------------------------\n'
const CARET_SYMBOL = '█'
const ANNOTATION_MARKER = '^'

function getCommentDelimiter(language: SupportedLanguage): CommentSymbolInfo {
    const languageConfig = getLanguageConfig(language)

    if (!languageConfig) {
        throw new Error(`No language config found for ${language}`)
    }

    const delimiter = languageConfig.commentStart.trim()
    const indent = ' '.repeat(delimiter.length)
    const separator = `${delimiter} ${SNIPPET_SEPARATOR}`

    return { delimiter, indent, separator }
}

function isCursorPositionLine(line: string, commentDelimiter: string): boolean {
    const trimmed = line.trim()

    return trimmed.startsWith(commentDelimiter) && trimmed.endsWith('|')
}

/**
 * Returns the character position that "|" the symbol highlights in a code sample.
 */
function getCaretPoint(lines: string[], commentDelimiter: string): Point | null {
    for (let row = 0; row < lines.length; row++) {
        const line = lines[row]
        const column = line.indexOf('|')

        if (isCursorPositionLine(line, commentDelimiter) && column !== -1) {
            return { row: row - 1, column }
        }
    }

    return null
}

function annotateMultilineEdge(cell: string[], side: 'start' | 'end', annotationId: string): void {
    // Find the annotation with the same length.
    // The length is fixed to one because we highlight only one character at start and end of
    // multiline nodes.
    const matchingAnnotation = cell.find(annotation => {
        return annotation.lastIndexOf(ANNOTATION_MARKER) === 0
    })

    if (matchingAnnotation) {
        // If matching annotation already includes the side label, just add another annotationId
        // E.g., ^ start parent[0] -> ^ start parent[0], parent[1]
        if (matchingAnnotation.includes(` ${side} `)) {
            cell[0] += `, ${annotationId}`
        } else {
            // If label is not included, add the side label and annotationId
            // E.g., ^ descendant -> ^ descendant, start parent[1]
            cell[0] += `, ${side} ${annotationId}`
        }
    } else {
        // If matching node is not found add the annotation line
        // E.g., ^ start parent[1]
        cell.push(`${ANNOTATION_MARKER} ${side} ${annotationId}`)
    }
}

interface Annotations {
    [line: number]: { [column: number]: string[] }
}

function initEmptyAnnotationsForPoint(annotations: Annotations, point: Point): void {
    if (!annotations[point.row]) {
        annotations[point.row] = {}
    }

    if (!annotations[point.row][point.column]) {
        annotations[point.row][point.column] = []
    }
}

// Defines the signature for functions that annotate nodes.
type Captures = (
    node: SyntaxNode,
    startPosition: Point,
    endPosition?: Point
) => readonly Readonly<Parser.QueryCapture>[]

interface AnnotateSnippetsParams {
    code: string
    language: SupportedLanguage
    parser: Parser
    captures: Captures
}

function annotateSnippets(params: AnnotateSnippetsParams): string {
    const { code, language, captures, parser } = params

    const { delimiter, indent } = getCommentDelimiter(language)
    // eslint-disable-next-line unicorn/prefer-string-replace-all
    const lines = code.split('\n').map(line => line.replaceAll(/\t/g, ' '.repeat(4)))
    const caretPoint = getCaretPoint(lines, delimiter)
    if (!caretPoint) {
        throw new Error('No caret point found in snippet: \n' + lines.join('\n'))
    }

    const cursorPositionLine = { index: -1, line: '' }
    const linesWithoutCursorComment = lines.filter((line, index) => {
        const isCursorLine = isCursorPositionLine(line, delimiter)

        if (isCursorLine) {
            cursorPositionLine.index = index
            cursorPositionLine.line = line
        }

        return !isCursorLine
    })

    const tree = parser.parse(linesWithoutCursorComment.join('\n'))
    const capturedNodes = captures(tree.rootNode, caretPoint, { ...caretPoint, column: caretPoint.column + 1 })

    if (!capturedNodes || capturedNodes.length === 0) {
        return code
    }

    // Matrix with annotations for each character in the code snippet.
    const annotations: Annotations = {}
    // An object to keep track of node-name indices.
    const nodeNameIndices: Record<string, number> = {}
    // An array to gather information about each node type.
    const nodeTypes = []

    for (const { name, node } of capturedNodes) {
        const { startPosition: start, endPosition, type } = node

        const end = {
            row: endPosition.row,
            // To account for single-char nodes where tree-sitter returns column index + 1.
            column: Math.max(endPosition.column - 1, 0),
        }

        const nameIndex = (nodeNameIndices[name] || 0) + 1
        nodeNameIndices[name] = nameIndex
        const annotationId = `${name}[${nameIndex}]`
        nodeTypes.push(`${delimiter} ${annotationId}: ${type}`)

        initEmptyAnnotationsForPoint(annotations, start)
        initEmptyAnnotationsForPoint(annotations, end)
        const startCell = annotations[start.row][start.column]

        // Handle single-line nodes
        if (start.row === end.row) {
            const matchingAnnotation = startCell.find(annotation => {
                return annotation.lastIndexOf(ANNOTATION_MARKER) === node.text.length - 1
            })

            if (matchingAnnotation) {
                startCell[0] += `, ${annotationId}`
            } else {
                startCell.push('^'.repeat(node.text.length) + ' ' + annotationId)
            }
        } else {
            // Handle multi-line nodes
            annotateMultilineEdge(startCell, 'start', annotationId)
            annotateMultilineEdge(annotations[end.row][end.column], 'end', annotationId)
        }
    }

    const result: string[] = []
    for (let i = 0; i < linesWithoutCursorComment.length; i++) {
        if (i === cursorPositionLine.index) {
            result.push(delimiter + ' '.repeat(cursorPositionLine.line.length - 1) + CARET_SYMBOL)
        }

        const line = linesWithoutCursorComment[i]
        result.push(line.length === 0 || line.startsWith(delimiter) ? line : indent + line)

        if (annotations[i]) {
            for (const col of Object.keys(annotations[i])) {
                const columnNumber = Number(col)

                for (const annotationLine of annotations[i][columnNumber]) {
                    result.push(delimiter + ' '.repeat(columnNumber) + annotationLine)
                }
            }
        }
    }

    let annotatedCodeSnippet = result.filter(line => !isCursorPositionLine(line, delimiter)).join('\n')

    // Add extra line betwee the annotated code and node types annotations if needed.
    if (!annotatedCodeSnippet.endsWith('\n\n')) {
        annotatedCodeSnippet += '\n'
    }

    const nodeTypesAnnotation = `${delimiter} Nodes types:\n` + nodeTypes.join('\n') + '\n\n'
    return annotatedCodeSnippet + nodeTypesAnnotation
}

const DOCUMENTATION_HEADER = `
| - query start position in the source file.
█ – query start position in the annotated file.
^ – characters matching the last query result.`

function commentOutLines(text: string, commentSymbol: string): string {
    return text
        .split('\n')
        .map(line => commentSymbol + ' ' + line)
        .join('\n')
}

interface AnnotateAndMatchParams {
    sourcesPath: string
    parser: Parser
    language: SupportedLanguage
    captures: Captures
}

/**
 * Add "// only", or other comment delimiter for the current language, to
 * focus on one code sample (similar to `it.only` from `jest`).
 */
export async function annotateAndMatchSnapshot(params: AnnotateAndMatchParams): Promise<void> {
    const { captures, sourcesPath, parser, language } = params

    const { delimiter, separator } = getCommentDelimiter(language)

    // Get the source code and split into snippets.
    const code = fs.readFileSync(path.join(__dirname, sourcesPath), 'utf8')
    // Queries are used on specific parts of the source code (e.g., range of the inserted multiline completion).
    // Snippets are required to mimick such behavior and test the order of returned captures.
    const snippets = code.split(separator)
    // Support "// only" to focus on one code sample at a time
    const onlySnippet = findLast(snippets, snippet => snippet.startsWith(`${delimiter} only`))

    const header = dedent`
        ${commentOutLines(DOCUMENTATION_HEADER, delimiter)}
        ${delimiter}
    `.trim()

    const annotated = (onlySnippet ? [onlySnippet] : snippets)
        .map(snippet => {
            return annotateSnippets({ code: snippet, language, parser, captures })
        })
        .join(separator)

    const content = header + '\n' + separator + '\n' + annotated

    const { ext, dir, name } = path.parse(sourcesPath)
    const snapshotFilePath = path.join(dir, name + '.snap' + ext)

    await expect(content).toMatchFileSnapshot(snapshotFilePath)
}
