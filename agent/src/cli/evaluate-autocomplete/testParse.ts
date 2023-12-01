import Parser, { Tree } from 'web-tree-sitter'

/** Returns true if the new text parses successfully. */
export function testParse(newText: string, parser: Parser, previousTree: Tree): boolean | undefined {
    const newTree = parser.parse(newText, previousTree)
    const hasError = newTree.rootNode.hasError()
    newTree.delete()
    return !hasError
}
