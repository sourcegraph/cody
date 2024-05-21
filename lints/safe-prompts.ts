// Checks that prompts track the source of context from the editor through to
// the finished string.
//
// - Literal strings are considered safe.
// - Dynamic strings must be constructed with helper functions that make the
//   correct behavior convenient.
// - Strings derived from the above are considered safe.
// - Functions which finally send prompts on the network should only take prompt-
//   safe strings, not arbitrary strings.
//
// To achieve this, we can't use strings for prompt pieces, but instead use
// objects. Prompts can only be manipulated with a tagged template literal and
// "safe" variants of string functions.
//
// Usage:
// pnpm ts-node lints/safe-prompts.ts file.ts
//
// Use `pnpm tsc --listFilesOnly` to get a list of TypeScript files to process.
//
//
// In CI, we use `git diff --name-only main | grep -E "\.(ts|tsx)$"` to get a list
// of files that were changed.
//
// References:
// https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API
// https://astexplorer.net/ with the parser set to "typescript"

import { readFileSync } from 'node:fs'
import * as ts from 'typescript'

interface Range {
    start: number
    end: number
}

let didEncounterAnError = false

export function delint(sourceFile: ts.SourceFile, ranges: Range[] | null) {
    delintNode(sourceFile)

    function delintNode(node: ts.Node) {
        if (node.flags & ts.NodeFlags.ThisNodeHasError) {
            report(node, 'error', 'The file could not be parsed')
            return
        }
        switch (node.kind) {
            case ts.SyntaxKind.Identifier: {
                const identifierNode = node as ts.Identifier
                const text = identifierNode.escapedText.toString()
                if (
                    text === 'ps' &&
                    !(
                        (node.parent?.kind === ts.SyntaxKind.TaggedTemplateExpression &&
                            (node.parent as ts.TaggedTemplateExpression).tag === node) ||
                        (node.parent?.kind === ts.SyntaxKind.FunctionDeclaration &&
                            (node.parent as ts.FunctionDeclaration).name === node) ||
                        (node.parent?.kind === ts.SyntaxKind.MethodDeclaration &&
                            (node.parent as ts.MethodDeclaration).name === node) ||
                        (node.parent?.kind === ts.SyntaxKind.ImportSpecifier &&
                            (node.parent as ts.ImportSpecifier).name === node)
                    )
                ) {
                    report(node, 'error', 'Use `ps` only as a tagged template literal')
                    break
                }

                if (
                    text.startsWith('unsafe_') &&
                    node.parent?.kind !== ts.SyntaxKind.FunctionDeclaration
                ) {
                    report(
                        node,
                        'error',
                        `New \`${text}\` invocation found. This is not safe. Please use one of the PromptString helpers instead.`
                    )
                    break
                }
            }
        }

        ts.forEachChild(node, delintNode)
    }

    function report(node: ts.Node, level: 'error' | 'warning', message: string) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
        const { line: endLine, character: endCharacter } = sourceFile.getLineAndCharacterOfPosition(
            node.getEnd()
        )

        // When ranges are set, only error if the reported violation is within one
        // of the changed ranges.
        if (ranges !== null) {
            const overlappingRange = ranges.find(
                // line and endLine start with 0, the supplied ranges with 1
                range => range.start <= line + 1 && range.end >= endLine + 1
            )
            if (overlappingRange === undefined) {
                return
            }
        }

        if (level === 'error') {
            didEncounterAnError = true
        }

        if (process.env.GITHUB_ACTIONS !== undefined) {
            console.log(
                `::${level} file=${sourceFile.fileName},line=${line + 1},col=${character + 1},endLine=${
                    endLine + 1
                },endColumn=${endCharacter + 1}::${message}`
            )
        }
        console.log(`${sourceFile.fileName} (${line + 1},${character + 1}): ${message}`)
    }
}

const fileNames = process.argv.slice(2)
for (const row of fileNames) {
    try {
        const [fileName, rawRanges] = row.split(':')

        const rangeStrings = rawRanges.split(',')
        let ranges: Range[] | null = null
        for (const rangeString of rangeStrings) {
            const [start, end] = rangeString.split('-')
            if (ranges === null) {
                ranges = []
            }
            ranges.push({ start: Number.parseInt(start), end: Number.parseInt(end) })
        }

        // Parse a file
        const sourceFile = ts.createSourceFile(
            fileName,
            readFileSync(fileName).toString(),
            ts.ScriptTarget.ES2015, // TODO: is this the right script target?
            /*setParentNodes */ true
        )

        // delint it
        delint(sourceFile, ranges)
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            continue
        }

        throw error
    }
}

if (didEncounterAnError) {
    process.exit(1)
}
