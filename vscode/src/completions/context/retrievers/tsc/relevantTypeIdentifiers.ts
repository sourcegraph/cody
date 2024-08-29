import ts from 'typescript'
import { declarationName } from './SymbolFormatter'

export type NodeMatchKind =
    | 'imports'
    | 'call-expression'
    | 'property-access'
    | 'function-declaration'
    | 'declaration'
    | 'none'

/**
 * Returns a list of identifier nodes that should be added to the Cody context.
 *
 * The logic for this function is going to be evolving as we add support for
 * more syntax constructs where we want to inject graph context.
 */
export function relevantTypeIdentifiers(
    checker: ts.TypeChecker,
    node: ts.Node
): { kind: NodeMatchKind; nodes: ts.Node[] } {
    const nodes: ts.Node[] = []
    const kind = pushTypeIdentifiers(nodes, checker, node)
    return { kind, nodes }
}

function pushTypeIdentifiers(result: ts.Node[], checker: ts.TypeChecker, node: ts.Node): NodeMatchKind {
    if (ts.isSourceFile(node)) {
        ts.forEachChild(node, child => {
            if (ts.isImportDeclaration(child)) {
                pushDescendentIdentifiers(result, child)
            }
        })
        return 'imports'
    }
    if (
        ts.isSetAccessorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isCallSignatureDeclaration(node) ||
        ts.isMethodDeclaration(node)
    ) {
        for (const parameter of node.parameters) {
            if (parameter.type) {
                pushDescendentIdentifiers(result, parameter.type)
            }
        }
        if (node.type) {
            pushDescendentIdentifiers(result, node.type)
        }
        return 'function-declaration'
    }
    if (ts.isCallExpression(node)) {
        result.push(...rightmostIdentifier(node.expression))
        return 'call-expression'
    }
    if (ts.isPropertyAccessExpression(node)) {
        result.push(...rightmostIdentifier(node.expression))
        return 'property-access'
    }
    const name = declarationName(node)
    if (name) {
        result.push(name)
        return 'declaration'
    }
    // Uncomment below to debug what kind of if (ts.isX) case to handle
    // console.log({ text: node.getText(), kindString: ts.SyntaxKind[node.kind] })
    return 'none'
}

// A hacky way to get the `ts.Identifier` node furthest to the right.  Ideally,
// we should match on the main common node types to get this directly, but it's
// easy to not handle all cases so this works a bit more reliably at the cost of
// some performance overhead.
function rightmostIdentifier(node: ts.Node): ts.Node[] {
    let result: ts.Node | undefined
    walkTSNode(node, child => {
        if (!ts.isIdentifier(child)) {
            return
        }
        if (result === undefined) result = child
        else if (child.getStart() > result.getStart()) {
            result = child
        }
    })
    return result ? [result] : []
}

export function walkTSNode(node: ts.Node, handler: (node: ts.Node) => void): void {
    handler(node)
    ts.forEachChild(node, child => {
        handler(child)
        walkTSNode(child, handler)
    })
}

function pushDescendentIdentifiers(result: ts.Node[], node: ts.Node): void {
    walkTSNode(node, child => {
        if (ts.isIdentifier(child)) {
            result.push(child)
        }
    })
}
