import ts from 'typescript'
import { declarationName } from '../../../../../vscode/src/completions/context/retrievers/tsc/SymbolFormatter'
import { AggregateBuckets, Buckets } from './Buckets'
import { DiagnosticCode } from './DiagnosticCode'
import { findReturn } from './findReturn'
import { isBasicTypeRef } from './isBasicTypeRef'
export interface FixCandidate {
    newContent: string
    impactedLine: number
    expectedDiagnosticCode: DiagnosticCode
}

// Attempt to synthesize diagnostics matching the examples in
// https://linear.app/sourcegraph/issue/CODY-15/edit-fix-provide-tailored-prompt-information-for-the-most-popular#comment-b4cbeb4f
// The current implementation is naive and generates obviously fake errors that
// don't look like real-world production diagnostics (even if they have the
// right diagnostic code). Ideally, we can build a large corpus of "real world" diagnostics
// that we use instead.
export function generateTotallyFakeDiagnostics(
    sourceFile: ts.SourceFile,
    globalBuckets: Buckets<DiagnosticCode>
): FixCandidate[] {
    sourceFile.statements
    const localBuckets = new Buckets<DiagnosticCode>(20)
    const b = new AggregateBuckets([globalBuckets, localBuckets])
    const result: FixCandidate[] = []
    const loop = (node: ts.Node): void => {
        if (
            ts.isFunctionDeclaration(node) &&
            node.type &&
            !isBasicTypeRef(node.type) &&
            b.peek(DiagnosticCode.TS2322)
        ) {
            console.log({
                stats: node.body?.statements.map(x =>
                    console.log({ x: x.getText(), kind: ts.SyntaxKind[x.kind] })
                ),
            })
            const lastVariableDeclaration = node.body?.statements.findLast(s => declarationName(s))
            if (lastVariableDeclaration) {
                const name = declarationName(lastVariableDeclaration)
                const returnNode = findReturn(node)
                console.log({ name: name?.getText() })
                if (
                    returnNode?.expression &&
                    name &&
                    returnNode.expression.getText() !== name.getText() &&
                    b.acquire(DiagnosticCode.TS2322)
                ) {
                    result.push({
                        impactedLine: sourceFile.getLineAndCharacterOfPosition(returnNode.expression.pos)
                            .line,
                        newContent: [
                            sourceFile.text.slice(0, returnNode.expression.pos),
                            ` ${name.getText()}`,
                            sourceFile.text.slice(returnNode.expression.end),
                        ].join(''),
                        expectedDiagnosticCode: DiagnosticCode.TS2322,
                    })
                }
            }
        }
        if (ts.isBlock(node) && b.peek(DiagnosticCode.TS2322)) {
            let previousType: ts.Node | undefined
            for (const statement of node.statements) {
                if (ts.isVariableDeclaration(statement) && statement.type) {
                    if (previousType && b.acquire(DiagnosticCode.TS2322)) {
                        result.push({
                            impactedLine: sourceFile.getLineAndCharacterOfPosition(statement.type.pos)
                                .line,
                            newContent: [
                                sourceFile.text.slice(0, statement.type.getStart()),
                                previousType.getText(),
                                sourceFile.text.slice(previousType.end, statement.type.pos),
                                sourceFile.text.slice(statement.type.getEnd()),
                            ].join(''),
                            expectedDiagnosticCode: DiagnosticCode.TS2322,
                        })
                    }
                    previousType = statement.type
                }
            }
        }
        if (
            ts.isCallExpression(node) &&
            node.arguments.length > 2 &&
            node.arguments[0].getText() !== node.arguments[1].getText() &&
            b.acquire(DiagnosticCode.TS2345)
        ) {
            result.push({
                impactedLine: sourceFile.getLineAndCharacterOfPosition(node.arguments[1].pos).line,
                // Replace second argument with a copy of the first argument.
                newContent: [
                    sourceFile.text.slice(0, node.arguments[1].getStart()),
                    node.arguments[0].getText(),
                    sourceFile.text.slice(node.arguments[1].getEnd()),
                ].join(''),
                expectedDiagnosticCode: DiagnosticCode.TS2345,
            })
        }

        if (ts.isPropertyAccessChain(node) && b.acquire(DiagnosticCode.TS2339)) {
            result.push({
                impactedLine: sourceFile.getLineAndCharacterOfPosition(node.name.pos).line,
                newContent: [
                    sourceFile.text.slice(0, node.name.getStart()),
                    'neverGonnaLetMeDown',
                    sourceFile.text.slice(node.name.getEnd()),
                ].join(''),
                expectedDiagnosticCode: DiagnosticCode.TS2339,
            })
        }

        ts.forEachChild(node, child => loop(child))
    }
    loop(sourceFile)

    return result
}
