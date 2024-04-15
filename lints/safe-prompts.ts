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

let didEncounterAnError = false

export function delint(sourceFile: ts.SourceFile) {
    delintNode(sourceFile)

    function delintNode(node: ts.Node) {
        if (node.flags & ts.NodeFlags.ThisNodeHasError) {
            report(node, 'error', 'Error', 'The file could not be parsed')
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
                    report(
                        node,
                        'error',
                        'Unsafe use of `ps`',
                        'Use `ps` only as a tagged template literal'
                    )
                    break
                }

                if (
                    text.startsWith('unsafe_') &&
                    node.parent?.kind !== ts.SyntaxKind.FunctionDeclaration
                ) {
                    report(
                        node,
                        'error',
                        'Unsafe function usage',
                        `New \`${text}\` invocation found. Please use one of the PromptString helpers instead.`
                    )
                    break
                }
            }
        }

        ts.forEachChild(node, delintNode)
    }

    function report(node: ts.Node, level: 'error' | 'warning', title: string, message: string) {
        if (level === 'error') {
            didEncounterAnError = true
        }

        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
        console.log(`${sourceFile.fileName} (${line + 1},${character + 1}): ${title}: ${message}`)
        if (process.env.GITHUB_ACTIONS !== undefined) {
            console.log(
                `::${level} file=${sourceFile.fileName},line=${line + 1},endLine=${
                    line + 1
                },title=${title}::${message}`
            )
        }
    }
}

const fileNames = process.argv.slice(2)
for (const fileName of fileNames) {
    // Parse a file
    const sourceFile = ts.createSourceFile(
        fileName,
        readFileSync(fileName).toString(),
        ts.ScriptTarget.ES2015, // TODO: is this the right script target?
        /*setParentNodes */ true
    )

    // delint it
    delint(sourceFile)
}

if (didEncounterAnError) {
    process.exit(1)
}
