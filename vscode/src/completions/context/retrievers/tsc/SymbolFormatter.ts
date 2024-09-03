import { defaultPathFunctions } from '@sourcegraph/cody-shared'
// Copy-pasted and adapted code from scip-typescript
import ts from 'typescript'
import { CodePrinter } from './CodePrinter'
import { getTSSymbolAtLocation } from './getTSSymbolAtLocation'
import { walkTSNode } from './relevantTypeIdentifiers'
import * as ts_internals from './ts-internals'

const path = defaultPathFunctions()

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
    public queue = new Map<ts.Symbol, number>()
    public isRendered = new Set<ts.Symbol>()
    private depth = 0
    constructor(
        private checker: ts.TypeChecker,
        private maxDepth: number
    ) {}

    public formatSymbol(
        declaration: ts.Node,
        sym: ts.Symbol,
        depth: number,
        params?: { stripEnclosingInformation?: boolean }
    ): string {
        const oldDepth = this.depth
        this.depth = depth
        this.queueRelatedSymbols(sym)
        this.depth = oldDepth

        if (ts.isClassLike(declaration) || ts.isInterfaceDeclaration(declaration)) {
            return this.formatClassOrInterface(declaration, sym)
        }

        if (ts.isEnumDeclaration(declaration)) {
            return this.formatEnumDeclaration(declaration, sym)
        }

        if (ts.isTypeAliasDeclaration(declaration)) {
            return this.formatTypeAlias(declaration, sym)
        }

        if (isSignatureDeclaration(declaration)) {
            return this.formatSignature(declaration, sym)
        }

        return ts_internals.formatSymbol(this.checker, declaration, sym, params)
    }

    private queueRelatedSymbols(sym: ts.Symbol): void {
        if (this.depth > this.maxDepth) {
            return
        }
        const walkNode = (node: ts.Node | undefined): void => {
            if (!node) {
                return
            }

            walkTSNode(node, child => {
                if (ts.isIdentifier(child)) {
                    const childSymbol = getTSSymbolAtLocation(this.checker, child)
                    if (childSymbol) {
                        this.queueSingleSymbol(childSymbol)
                    }
                }
            })
        }
        for (const decl of sym.declarations ?? []) {
            walkNode(decl)
            if (
                ts.isSetAccessorDeclaration(decl) ||
                ts.isGetAccessorDeclaration(decl) ||
                ts.isConstructorDeclaration(decl) ||
                ts.isFunctionDeclaration(decl) ||
                ts.isMethodSignature(decl) ||
                ts.isMethodDeclaration(decl)
            ) {
                for (const parameter of decl.parameters) {
                    walkNode(parameter.type)
                }
                walkNode(decl.type)
            } else if (
                ts.isParameter(decl) ||
                ts.isPropertyDeclaration(decl) ||
                ts.isPropertySignature(decl) ||
                ts.isVariableDeclaration(decl)
            ) {
                walkNode(decl.type)
            }
        }
    }

    private queueSingleSymbol(s: ts.Symbol): void {
        if (isStdLibSymbol(s)) {
            return
        }
        this.queue.set(s, this.depth + 1)
    }

    private registerRenderedNode(node: ts.Node): void {
        const symbol = getTSSymbolAtLocation(this.checker, node)
        if (symbol) {
            this.isRendered.add(symbol)
        }
    }

    private formatEnumDeclaration(declaration: ts.EnumDeclaration, sym: ts.Symbol): string {
        const p = new CodePrinter()
        p.line(`enum ${sym.name} {`)
        p.block(() => {
            for (const member of declaration.members) {
                this.registerRenderedNode(member.name)
                if (member.initializer) {
                    p.line(`${member.name.getText()} = ${member.initializer.getText()}`)
                } else {
                    p.line(member.name.getText())
                }
            }
        })
        p.line('}')
        return p.build()
    }

    private formatTypeAlias(declaration: ts.TypeAliasDeclaration, sym: ts.Symbol): string {
        const parameters =
            declaration.typeParameters && declaration.typeParameters.length > 0
                ? `<${declaration.typeParameters.map(t => t.getText())}>`
                : ''
        return `type ${sym.name}${parameters} = ${this.checker.typeToString(
            this.checker.getTypeFromTypeNode(declaration.type),
            declaration,
            ts.TypeFormatFlags.InTypeAlias
        )}`
    }

    private formatSignature(declaration: ts.SignatureDeclaration, sym: ts.Symbol): string {
        const signature = this.checker.getSignatureFromDeclaration(declaration)
        if (!signature) {
            return ''
        }
        const name = ts.isConstructorDeclaration(declaration) ? 'constructor' : sym.name
        const prefix = ts.isFunctionDeclaration(declaration) ? 'function ' : ''
        return prefix + name + this.checker.signatureToString(signature)
    }

    private formatClassOrInterface(
        declaration: ts.ClassLikeDeclaration | ts.InterfaceDeclaration,
        sym: ts.Symbol
    ): string {
        const p = new CodePrinter()
        const heritageClauses = declaration.heritageClauses ?? []
        const keyword = ts.isClassLike(declaration) ? 'class' : 'interface'
        p.text(keyword)
        p.text(' ')
        p.text(sym.name)
        p.text(' ')
        if (heritageClauses.length > 0) {
            p.text(heritageClauses.map(clause => this.safeGetText(clause)).join(', '))
            p.text(' ')
        }
        p.line('{')
        p.block(() => {
            for (const [memberName, member] of sym.members ?? []) {
                this.isRendered.add(member)
                this.queueSingleSymbol(member)
                this.queueRelatedSymbols(member)
                const decl = member.declarations?.[0]
                if (!decl) {
                    continue
                }
                const name = declarationName(decl)
                if (name) {
                    p.line(
                        this.formatSymbol(decl, member, this.depth + 1, {
                            stripEnclosingInformation: true,
                        })
                    )
                } else if (memberName === ts.InternalSymbolName.Constructor) {
                    p.line(
                        this.formatSymbol(decl, member, this.depth + 1, {
                            stripEnclosingInformation: true,
                        })
                    )
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

// Returns true if this node is defined in the TypeScript stdlib.
export function isStdLibNode(node: ts.Node): boolean {
    const basename = path.basename(node.getSourceFile().fileName)
    // HACK: this solution has false positives. We should use the
    // scip-typescript package logic to determine this reliably.
    return basename.startsWith('lib.') && basename.endsWith('.d.ts')
}

function isStdLibSymbol(sym: ts.Symbol): boolean {
    for (const decl of sym.declarations ?? []) {
        return isStdLibNode(decl)
    }
    return false
}

const isSignatureDeclaration = (declaration: ts.Node): declaration is ts.SignatureDeclaration => {
    const _typechecks: ts.SignatureDeclaration | undefined =
        ts.isIndexSignatureDeclaration(declaration) ||
        ts.isCallSignatureDeclaration(declaration) ||
        ts.isMethodSignature(declaration) ||
        ts.isConstructorDeclaration(declaration) ||
        ts.isFunctionDeclaration(declaration) ||
        ts.isMethodDeclaration(declaration)
            ? declaration
            : undefined
    return _typechecks !== undefined
}
