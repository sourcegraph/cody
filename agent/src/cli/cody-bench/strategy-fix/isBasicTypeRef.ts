import ts from 'typescript'

export function isBasicTypeRef(node: ts.TypeNode): boolean {
    if (ts.isArrayTypeNode(node)) {
        return isBasicTypeRef(node.elementType)
    }
    if (ts.isUnionTypeNode(node)) {
        return node.types.some(isBasicTypeRef)
    }
    return ts.isIdentifier(node) || ts.isTypeReferenceNode(node)
}
