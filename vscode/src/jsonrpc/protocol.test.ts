import { basename, relative } from 'node:path'
import * as ts from 'typescript'
import { describe, expect, test } from 'vitest'

describe('protocol null/undefined robustness', () => {
    testProtocolDefinitionIsRobustToNullUndefinedEquivalence(__dirname + '/agent-protocol.ts')
    testProtocolDefinitionIsRobustToNullUndefinedEquivalence(__dirname + '/bfg-protocol.ts')
    testProtocolDefinitionIsRobustToNullUndefinedEquivalence(__dirname + '/embeddings-protocol.ts')
    testProtocolDefinitionIsRobustToNullUndefinedEquivalence(__dirname + '/../chat/protocol.ts')
})

/**
 * See explanatory message printed for failures below.
 */
function testProtocolDefinitionIsRobustToNullUndefinedEquivalence(path: string): void {
    test(`${basename(path)}`, () => {
        expect(true).toBe(true)
        const sourceText = ts.sys.readFile(path)!
        expect(sourceText).toBeDefined()
        const sourceFile = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true)

        const problems: { path: string; pos: number; message: string }[] = []
        function visit(node: ts.Node): void {
            if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
                for (const member of node.members) {
                    if (ts.isPropertySignature(member)) {
                        visitPropertySignature(member)
                    }
                }
            }

            ts.forEachChild(node, visit)
        }
        function visitPropertySignature(node: ts.PropertySignature): void {
            // If the PropertySignature has any of `null`, `undefined`, or `?` (denoting an optional
            // field), make sure it has *all* of them.
            const hasOptional = Boolean(node.questionToken)
            const hasNullOrUndefined = Boolean(node.type && isNullOrUndefined(node.type))
            const hasUnionWithNullOrUndefined =
                node.type && ts.isUnionTypeNode(node.type) && node.type.types.some(isNullOrUndefined)

            if (hasOptional || hasNullOrUndefined || hasUnionWithNullOrUndefined) {
                const hasAllMarkers =
                    hasOptional &&
                    node.type &&
                    ts.isUnionTypeNode(node.type) &&
                    node.type.types.some(type => type.kind === ts.SyntaxKind.UndefinedKeyword) &&
                    node.type.types.some(
                        type =>
                            ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword
                    )
                if (!hasAllMarkers) {
                    problems.push({
                        path,
                        pos: node.getStart(),
                        message: `property "${node.name.getText()}" type must accept null, undefined, and optional ("${node.name.getText()}?: T | undefined | null")`,
                    })
                }
            }
        }

        visit(sourceFile)
        if (problems.length > 0) {
            expect.fail(
                [
                    `Invalid protocol definitions: ${problems.length} problems.`,
                    '',
                    "Problem: If a property's type includes any of `null`, `undefined`, or `?` (optional field), then it must use *all* of them.",
                    '',
                    'Fix: Use `field?: T | null | undefined` instead of `field?: T`.',
                    '',
                    'Explanation: To prevent bugs when communicating with peers implemented in different programming languages cross-process RPC protocols must not differentiate between `undefined`, ECMAScript property presence (`hasOwnProperty`), and `null`.',
                    'Anywhere that a value can be `undefined`, our code needs to handle `null` values or no such property existing, and all must be handled in the same way (and vice versa).',
                    '',
                    '',
                ].join('\n') +
                    problems
                        .map(
                            ({ path, pos, message }) =>
                                `${relative(process.cwd(), path)}:${lineColonChar(
                                    sourceFile.getLineAndCharacterOfPosition(pos)
                                )}: ${message}`
                        )
                        .join('\n')
            )
        }
    })
}

function lineColonChar(lc: ts.LineAndCharacter): string {
    return `${lc.line + 1}:${lc.character + 1}`
}

function isNullOrUndefined(node: ts.Node): boolean {
    return (
        (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword) ||
        node.kind === ts.SyntaxKind.UndefinedKeyword
    )
}
