import ts from 'typescript'

export const findReturn = (node: ts.Node): ts.ReturnStatement | undefined => {
    if (
        ts.isReturnStatement(node) &&
        node.expression &&
        !ts.isFunctionLike(node.expression) &&
        !ts.isArrowFunction(node.expression)
    ) {
        return node
    }

    if (ts.isArrowFunction(node)) {
        return undefined
    }

    let found: ts.ReturnStatement | undefined
    ts.forEachChild(node, child => {
        if (found) {
            return
        }
        found = findReturn(child)
    })
    return found
}
