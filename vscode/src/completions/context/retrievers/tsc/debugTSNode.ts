import ts from 'typescript'

/**
 * Helper to debug a `ts.Node` value. Use it like this: `debugTSNode({someNode})`
 */
export function debugTSNode(nodes: Record<string, ts.Node>): void {
    const where = new Error().stack?.split('\n') ?? []
    const line = where.at(2)
    if (line) {
        console.log(line?.trim())
    }
    const output: Record<string, string> = {}
    for (const key of Object.keys(nodes)) {
        output[key] = nodes[key].getText()
        output[key + '_kind'] = ts.SyntaxKind[nodes[key].kind]
    }
    console.log(output)
}
