/* eslint-disable no-sync */
import fs from 'fs'
import path from 'path'

import dedent from 'dedent'
import { expect } from 'vitest'
import Parser, { Point, Query } from 'web-tree-sitter'

import { getLanguageConfig } from '../../language'
import { SupportedLanguage } from '../grammars'

interface CommentSymbolInfo {
    delimiter: string
    indent: string
    separator: string
}

const SNIPPET_SEPARATOR = '------------------------------------\n'

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

function getCaretPoint(lines: string[], commentDelimiter: string): Point | null {
    for (let row = 0; row < lines.length; row++) {
        const line = lines[row]
        const column = line.indexOf('|')

        if (isCursorPositionLine(line, commentDelimiter) && column !== -1) {
            return { row, column }
        }
    }

    return null
}

function generateAnnotation(line: string, lineStartColumn: number, lineEndColumn: number): string {
    return line.slice(lineStartColumn, lineEndColumn).replaceAll(/\S/g, '^').replaceAll(/\s/g, ' ')
}

function replaceAt(value: string, index: number, replacement: string): string {
    return value.slice(0, index) + replacement + value.slice(index + replacement.length)
}

interface AnnotateSnippetsParams {
    code: string
    language: SupportedLanguage
    parser: Parser
    query: Query
}

/**
 * Adds "^" symbol under every character in the last captured the query node.
 * Keeps the position of the query start position to make it easier to review snapshots.
 */
function annotateSnippets(params: AnnotateSnippetsParams): string {
    const { code, language, parser, query } = params

    const { delimiter, indent } = getCommentDelimiter(language)
    const lines = code.split('\n')
    const caretPoint = getCaretPoint(lines, delimiter)
    if (!caretPoint) {
        return code
    }

    const tree = parser.parse(code)
    const captures = query.captures(tree.rootNode, caretPoint, caretPoint)
    if (!captures.length) {
        return code
    }

    // Taking the last result to get the most nested node.
    // See https://github.com/tree-sitter/tree-sitter/discussions/2067
    const initialNode = captures.at(-1)!.node
    // Check for special cases where we need match a parent node.
    // TODO(tree-sitter): extract this logic from the test utility.
    const potentialParentNodes = captures.filter(capture => capture.name === 'parents')
    const potentialParent = potentialParentNodes.find(capture => initialNode.parent?.id === capture.node.id)?.node
    const { startPosition: start, endPosition: end } = potentialParent || initialNode

    const result = []

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Add the current line with the proper indentation
        result.push(line.length === 0 || line.startsWith(delimiter) ? line : indent + line)

        // Add annotations if necessary
        if (i >= start.row && i <= end.row) {
            // Skip caret lines
            if (isCursorPositionLine(line, delimiter)) {
                continue
            }

            const lineStartColumn = i === start.row ? start.column : 0
            const lineEndColumn = i === end.row ? end.column : line.length
            const annotation = generateAnnotation(line, lineStartColumn, lineEndColumn)

            if (annotation.trim()) {
                const spacesBefore = ' '.repeat(lineStartColumn)
                let annotatedLine = delimiter + spacesBefore + annotation

                // Keep cursor indicator if necessary
                const nextLine = lines.at(i + 1)
                const indicatorPosition =
                    nextLine && isCursorPositionLine(nextLine, delimiter)
                        ? nextLine.length - 1 + delimiter.length
                        : undefined

                if (indicatorPosition) {
                    annotatedLine = replaceAt(annotatedLine, indicatorPosition, '█')
                }

                result.push(annotatedLine)
            }
        } else if (isCursorPositionLine(line, delimiter)) {
            result.push(delimiter + ' '.repeat(line.length - 1) + '█')
        }
    }

    return result.filter(line => !isCursorPositionLine(line, delimiter)).join('\n')
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
    queryPath: string
    sourcesPath: string
    parser: Parser
    language: SupportedLanguage
}

export async function annotateAndMatchSnapshot(params: AnnotateAndMatchParams): Promise<void> {
    const { queryPath, sourcesPath, parser, language } = params

    const { delimiter, separator } = getCommentDelimiter(language)

    // Get the source code and split into snippets.
    const code = fs.readFileSync(path.join(__dirname, sourcesPath), 'utf8')
    // Queries are used on specific parts of the source code (e.g., range of the inserted multiline completion).
    // Snippets are required to mimick such behavior and test the order of returned captures.
    const snippets = code.split(separator)

    // Compile the tree-sitter query.
    // TODO(tree-sitter): add multi-lang support and extract from the text helper.
    const rawQuery = fs.readFileSync(path.join(__dirname, queryPath), 'utf8').trim()
    const query = parser.getLanguage().query(rawQuery)

    const header = dedent`
        ${commentOutLines(DOCUMENTATION_HEADER, delimiter)}
        ${delimiter}
        ${delimiter} Tree-sitter query:
        ${delimiter}
        ${commentOutLines(rawQuery, delimiter)}
    `.trim()

    const annotated = snippets
        .map(snippet => {
            return annotateSnippets({ code: snippet, language, parser, query })
        })
        .join(separator)

    const content = header + '\n' + separator + '\n' + annotated

    const { ext, dir, name } = path.parse(sourcesPath)
    const snapshotFilePath = path.join(dir, name + '.snap' + ext)

    await expect(content).toMatchFileSnapshot(snapshotFilePath)
}
