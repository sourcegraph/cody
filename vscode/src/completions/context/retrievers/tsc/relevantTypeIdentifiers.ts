import ts from 'typescript'
import { declarationName } from './SymbolFormatter'
import { getTSSymbolAtLocation } from './getTSSymbolAtLocation'

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
        const symbol = getTSSymbolAtLocation(checker, node.expression)
        for (const declaration of symbol?.declarations ?? []) {
            pushTypeIdentifiers(result, checker, declaration)
        }
    } else if (ts.isVariableDeclaration(node)) {
        if (node.type) {
            pushTypeIdentifiers(result, checker, node.type)
        }
    } else if (ts.isTypeLiteralNode(node)) {
        for (const member of node.members) {
            pushTypeIdentifiers(result, checker, member)
        }
    } else if (ts.isPropertyAccessExpression(node)) {
        pushTypeDefinition(result, checker, node.expression)
    } else {
        // Uncomment below to debug what kind of if (ts.isX) case to handle
        // console.log({ text: node.getText(), kindString: ts.SyntaxKind[node.kind] })
    }
}

// Equivalent to doing "Go to Type Definition" on an expression and adding the
// type definition to the Cody context.
export function pushTypeDefinition(result: ts.Node[], checker: ts.TypeChecker, node: ts.Node): void {
    const tpe = checker.getTypeAtLocation(node)
    const declaration = tpe?.symbol?.declarations?.[0]
    const name = declaration ? declarationName(declaration) : undefined
    if (name) {
        result.push(name)
    }
}

function walk(node: ts.Node, handler: (node: ts.Node) => void): void {
    ts.forEachChild(node, child => {
        handler(child)
        walk(child, handler)
    })
}

function pushDescendentIdentifiers(result: ts.Node[], node: ts.Node): void {
    walk(node, child => {
        if (ts.isIdentifier(child)) {
            result.push(child)
        }
    })
}
