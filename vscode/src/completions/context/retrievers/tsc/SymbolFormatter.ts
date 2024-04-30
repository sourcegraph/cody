// Copy-pasted and adapted code from scip-typescript
import * as ts from 'typescript'
import { CodePrinter } from './CodePrinter'
import { getTSSymbolAtLocation } from './getTSSymbolAtLocation'
import * as ts_internals from './ts-internals'

/**
 * Does a best-effort to render useful symbol signatures for the LLM. Goals:
 *
 * - Do something useful with minimal work. Ideally, we would implement a
 *   formatter from scratch that only uses `ts.Symbol` and `ts.Type` instead of
 *   `ts.Node.getText()` but that's going to require more effort than I
 *   (@olafurpg) have time for right now. The downside of using `ts.Node.getText()`
 *   is that it doesn't show inferred types.
 * - Better than `ts.Node.getText()` on the entire declaration node. For example,
 *   we want to leave out function bodies because they eat up the LLM context windows.
 *
 * A lot of code here is copy-pasted and adjusted from the scip-typescript
 * indexer. Ideally, we can eventually throw away this formatter and use
 * scip-typescript directly (and render signatures from
 * `scip.SymbolInformation`, which is easier to work with than
 * `ts.{Symbol,Type}`).
 */
export class SymbolFormatter {
    public queuedSymbols = new Set<ts.Symbol>()
    constructor(private checker: ts.TypeChecker) {}

    public formatSymbol(
        identifier: ts.Node,
        sym: ts.Symbol,
        params?: { printValidSyntax: boolean }
    ): string {
        const kind = scriptElementKind(identifier, sym)
        const type = (): string => {
            if (ts.isSourceFile(identifier)) {
                return ''
            }
            return this.checker.typeToString(this.checker.getTypeAtLocation(identifier))
        }
        const description = (text: string): string => {
            if (!params?.printValidSyntax) {
                return ''
            }
            return text
        }
        const asSignatureDeclaration = (
            node: ts.Node,
            sym: ts.Symbol
        ): ts.SignatureDeclaration | undefined => {
            const declaration = sym.declarations?.[0]
            if (!declaration) {
                return undefined
            }
            return ts.isConstructorDeclaration(node)
                ? node
                : ts.isFunctionDeclaration(declaration)
                  ? declaration
                  : ts.isMethodDeclaration(declaration)
                      ? declaration
                      : undefined
        }
        const signature = (): string | undefined => {
            const signatureDeclaration = asSignatureDeclaration(identifier, sym)
            if (!signatureDeclaration) {
                return undefined
            }
            const signature = this.checker.getSignatureFromDeclaration(signatureDeclaration)
            return signature ? this.checker.signatureToString(signature) : undefined
        }
        switch (kind) {
            case ts.ScriptElementKind.localVariableElement:
            case ts.ScriptElementKind.variableElement: {
                return 'var ' + this.safeGetText(identifier) + ': ' + type()
            }
            case ts.ScriptElementKind.memberVariableElement: {
                return description('(property) ') + this.safeGetText(identifier) + ': ' + type()
            }
            case ts.ScriptElementKind.parameterElement: {
                return description('(parameter) ') + this.safeGetText(identifier) + ': ' + type()
            }
            case ts.ScriptElementKind.constElement: {
                return 'const ' + this.safeGetText(identifier) + ': ' + type()
            }
            case ts.ScriptElementKind.letElement: {
                return 'let ' + this.safeGetText(identifier) + ': ' + type()
            }
            case ts.ScriptElementKind.alias: {
                return this.typeAlias(sym)
            }
            case ts.ScriptElementKind.constructorImplementationElement:
                return 'constructor' + (signature() || '')
            case ts.ScriptElementKind.classElement:
            case ts.ScriptElementKind.localClassElement: {
                if (ts.isConstructorDeclaration(identifier)) {
                    return 'constructor' + (signature() || '')
                }
                return 'class ' + this.safeGetText(identifier) + this.simplifiedObjectType(sym)
            }
            case ts.ScriptElementKind.interfaceElement: {
                return 'interface ' + this.safeGetText(identifier) + this.simplifiedObjectType(sym)
            }
            case ts.ScriptElementKind.enumElement: {
                for (const decl of sym.declarations ?? []) {
                    return this.safeGetText(decl) // TODO: print from signature
                }
                return 'enum ' + this.safeGetText(identifier)
            }
            case ts.ScriptElementKind.enumMemberElement: {
                let suffix = ''
                const declaration = sym.declarations?.[0]
                if (declaration && ts.isEnumMember(declaration)) {
                    const constantValue = this.checker.getConstantValue(declaration)
                    if (constantValue) {
                        suffix = ' = ' + constantValue.toString()
                    }
                }
                return description('(enum member) ') + this.safeGetText(identifier) + suffix
            }
            case ts.ScriptElementKind.functionElement: {
                return 'function ' + this.safeGetText(identifier) + (signature() || type())
            }
            case ts.ScriptElementKind.memberFunctionElement: {
                return description('(method) ') + this.safeGetText(identifier) + (signature() || type())
            }
            case ts.ScriptElementKind.memberGetAccessorElement: {
                return 'get ' + this.safeGetText(identifier) + ': ' + type()
            }
            case ts.ScriptElementKind.memberSetAccessorElement: {
                return 'set ' + this.safeGetText(identifier) + type()
            }
        }
        return this.safeGetText(identifier) + ': ' + type()
    }

    private typeAlias(sym: ts.Symbol): string {
        for (const decl of sym.declarations ?? []) {
            // Shortcut, just show the original code
            return this.safeGetText(decl)
        }
        return 'type ' + sym.name
    }

    public queueDeclaration(decl: ts.Declaration): void {
        if (ts.isClassLike(decl) || ts.isInterfaceDeclaration(decl)) {
            for (const heritage of decl.heritageClauses ?? []) {
                this.queueIdentifiers(heritage)
            }
        } else if (
            ts.isSetAccessorDeclaration(decl) ||
            ts.isGetAccessorDeclaration(decl) ||
            ts.isConstructorDeclaration(decl) ||
            ts.isFunctionDeclaration(decl) ||
            ts.isMethodDeclaration(decl)
        ) {
            decl.typeParameters?.forEach(this.queueIdentifiers)
            decl.parameters.forEach(this.queueIdentifiers)
            if (decl.type) this.queueIdentifiers(decl.type)
        } else if (
            ts.isParameter(decl) ||
            ts.isPropertyDeclaration(decl) ||
            ts.isPropertySignature(decl) ||
            ts.isVariableDeclaration(decl)
        ) {
            if (decl.type) {
                this.queueIdentifiers(decl.type)
            }
        }
    }

    public queueIdentifiers(node: ts.Node): void {
        if (ts.isIdentifier(node)) {
            const symbol = getTSSymbolAtLocation(this.checker, node)
            if (symbol) {
                this.queuedSymbols.add(symbol)
            }
        }
        node.forEachChild(child => child && this?.queueIdentifiers?.(child))
    }

    public simplifiedObjectType(sym: ts.Symbol): string {
        const declaration = sym.declarations?.[0]
        if (!declaration) {
            return ''
        }
        const p = new CodePrinter()
        if (ts.isClassLike(declaration) || ts.isInterfaceDeclaration(declaration)) {
            const heritageClauses = declaration.heritageClauses ?? []
            if (heritageClauses.length > 0) p.text(' ')
            p.text(heritageClauses.map(clause => this.safeGetText(clause)).join(', '))
            for (const clause of heritageClauses) {
                this.queueIdentifiers(clause)
            }
        }
        p.line(' {')
        p.block(() => {
            for (const [memberName, member] of sym.members ?? []) {
                const decl = member.declarations?.[0]
                if (!decl) {
                    continue
                }
                const name = declarationName(decl)
                if (name) {
                    this.queueDeclaration(decl)
                    p.line(this.formatSymbol(name, member))
                } else if (memberName === ts.InternalSymbolName.Constructor) {
                    this.queueDeclaration(decl)
                    p.line(this.formatSymbol(decl, member))
                }
            }
        })
        p.line('}')
        return p.build()
    }

    // Equivalent to node.getText() except guards against nodes without "real
    // positions", which throw an error when calling `.getText()`.
    private safeGetText(node: ts.Node): string {
        // TODO: come up with better default
        return node.pos >= 0 ? node.getText() : `${node}`
    }
}

function scriptElementKind(node: ts.Node, sym: ts.Symbol): ts.ScriptElementKind {
    const flags = sym.getFlags()
    if (flags & ts.SymbolFlags.TypeAlias) {
        return ts.ScriptElementKind.alias
    }
    if (flags & ts.SymbolFlags.Class) {
        return ts.ScriptElementKind.classElement
    }
    if (flags & ts.SymbolFlags.Interface) {
        return ts.ScriptElementKind.interfaceElement
    }
    if (flags & ts.SymbolFlags.Enum) {
        return ts.ScriptElementKind.enumElement
    }
    if (flags & ts.SymbolFlags.EnumMember) {
        return ts.ScriptElementKind.enumMemberElement
    }
    if (flags & ts.SymbolFlags.Method) {
        return ts.ScriptElementKind.memberFunctionElement
    }
    if (flags & ts.SymbolFlags.GetAccessor) {
        return ts.ScriptElementKind.memberGetAccessorElement
    }
    if (flags & ts.SymbolFlags.SetAccessor) {
        return ts.ScriptElementKind.memberSetAccessorElement
    }
    if (flags & ts.SymbolFlags.Constructor) {
        return ts.ScriptElementKind.constructorImplementationElement
    }
    if (flags & ts.SymbolFlags.Function) {
        return ts.ScriptElementKind.functionElement
    }
    if (flags & ts.SymbolFlags.Variable) {
        if (ts_internals.isParameter(sym)) {
            return ts.ScriptElementKind.parameterElement
        }
        if (node.flags & ts.NodeFlags.Const) {
            return ts.ScriptElementKind.constElement
        }
        if (node.flags & ts.NodeFlags.Let) {
            return ts.ScriptElementKind.letElement
        }
        return ts.ScriptElementKind.variableElement
    }
    if (flags & ts.SymbolFlags.ClassMember) {
        return ts.ScriptElementKind.memberVariableElement
    }
    return ts.ScriptElementKind.unknown
}

export function declarationName(node: ts.Node): ts.Node | undefined {
    if (
        ts.isBindingElement(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isEnumMember(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isAccessor(node) ||
        ts.isMethodSignature(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isModuleDeclaration(node) ||
        ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isParameter(node) ||
        ts.isTypeParameterDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isClassDeclaration(node)
    ) {
        return node.name
    }
    if (ts.isVariableDeclarationList(node)) {
        for (const declaration of node.declarations) {
            return declaration.name
        }
    }
    if (node.kind === ts.SyntaxKind.FirstStatement) {
        for (const child of node.getChildren()) {
            const name = declarationName(child)
            if (name) {
                return name
            }
        }
    }
    return undefined
}
