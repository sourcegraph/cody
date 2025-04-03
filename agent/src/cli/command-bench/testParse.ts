import type { WrappedParser } from '../../../../vscode/src/tree-sitter/parser'

/** Returns true if the new text parses successfully. */
export function testParses(newText: string, parser: WrappedParser): boolean | undefined {
    // Originally, this function passed the `previousTree` argument to benefit
    // from performance improvements but it didn't work correctly,
    // parseTest.test.ts was failing until we removed `previousTree`.
    const newTree = parser.parse(newText)
    const hasError = newTree.rootNode.hasError
    newTree.delete()
    return !hasError
}
