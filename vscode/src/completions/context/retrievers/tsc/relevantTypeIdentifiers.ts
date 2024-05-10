import ts from 'typescript'
import { declarationName } from './SymbolFormatter'

/**
 * Returns a list of identifier nodes that should be added to the Cody context.
 *
 * The logic for this function is going to be evolving as we add support for
 * more syntax constructs where we want to inject graph context.
 */
export function relevantTypeIdentifiers(checker: ts.TypeChecker, node: ts.Node): ts.Node[] {
    const result: ts.Node[] = []
    pushTypeIdentifiers(result, checker, node)
    return result
}

export function pushTypeIdentifiers(result: ts.Node[], checker: ts.TypeChecker, node: ts.Node): void {
    if (ts.isSourceFile(node)) {
        ts.forEachChild(node, child => {
            if (ts.isImportDeclaration(child)) {
                pushDescendentIdentifiers(result, child)
            }
        })
    } else if (
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
    } else if (ts.isCallExpression(node)) {
        result.push(...rightmostIdentifier(node.expression))
    } else if (ts.isPropertyAccessExpression(node)) {
        result.push(...rightmostIdentifier(node.expression))
    } else {
        const name = declarationName(node)
        if (name) {
            result.push(name)
        } else {
            // Uncomment below to debug what kind of if (ts.isX) case to handle
            // console.log({ text: node.getText(), kindString: ts.SyntaxKind[node.kind] })
        }
    }
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
