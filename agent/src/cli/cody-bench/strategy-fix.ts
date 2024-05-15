import ts from 'typescript'
import type { MessageHandler } from '../../jsonrpc-alias'
import { AggregateBuckets, Buckets } from './Buckets'
import type { EvaluateAutocompleteOptions } from './cody-bench'
import { evaluateEachFile } from './evaluateEachFile'

type DiagnosticCode = '2322' | '2345' | '2339'

export async function evaluateFixStrategy(
    client: MessageHandler,
    options: EvaluateAutocompleteOptions
): Promise<void> {
    console.log({ options })
    const globalBuckets = new Buckets<DiagnosticCode>(1_000)
    await evaluateEachFile(options, async params => {
        const file = params.uri.fsPath
        const sourceFile = ts.createSourceFile(file, params.content, ts.ScriptTarget.Latest, true)
        const candidates = fixCandidates(sourceFile, globalBuckets)
        console.log({ candidates: candidates.length })
        return undefined
    })
}

interface FixCandidate {
    newContent: string
    impactedLine: number
    expectedDiagnosticCode: string
}

// Attempt to synthesize diagnostics matching the examples in
// https://linear.app/sourcegraph/issue/CODY-15/edit-fix-provide-tailored-prompt-information-for-the-most-popular#comment-b4cbeb4f
function fixCandidates(
    sourceFile: ts.SourceFile,
    globalBuckets: Buckets<DiagnosticCode>
): FixCandidate[] {
    sourceFile.statements
    const localBuckets = new Buckets<DiagnosticCode>(10)
    const b = new AggregateBuckets([globalBuckets, localBuckets])
    const result: FixCandidate[] = []
    const loop = (node: ts.Node): void => {
        if (ts.isFunctionDeclaration(node) && node.type && isBasicTypeRef(node.type) && b.peek('2322')) {
            const returnNode = findReturn(node)
            if (returnNode?.expression) {
                b.acquire('2322')
                result.push({
                    impactedLine: sourceFile.getLineAndCharacterOfPosition(returnNode.expression.pos)
                        .line,
                    newContent: [
                        sourceFile.text.slice(0, returnNode.expression.pos),
                        " 'never gonna give you up'",
                        sourceFile.text.slice(returnNode.expression.pos),
                    ].join(''),
                    expectedDiagnosticCode: '2322',
                })
            }
        } else if (ts.isBlock(node) && b.peek('2322')) {
            let previousType: ts.Node | undefined
            for (const statement of node.statements) {
                if (ts.isVariableDeclaration(statement) && statement.type) {
                    if (previousType) {
                        b.acquire('2322')
                        result.push({
                            impactedLine: sourceFile.getLineAndCharacterOfPosition(statement.type.pos)
                                .line,
                            newContent: [
                                sourceFile.text.slice(0, statement.type.getStart()),
                                previousType.getText(),
                                sourceFile.text.slice(previousType.end, statement.type.pos),
                                sourceFile.text.slice(statement.type.getEnd()),
                            ].join(''),
                            expectedDiagnosticCode: '2322',
                        })
                    }
                    previousType = statement.type
                }
            }
        } else if (
            ts.isCallExpression(node) &&
            node.arguments.length > 2 &&
            node.arguments[0].getText() !== node.arguments[1].getText() &&
            b.acquire('2345')
        ) {
            result.push({
                impactedLine: sourceFile.getLineAndCharacterOfPosition(node.arguments[1].pos).line,
                // Replace second argument with a copy of the first argument.
                newContent: [
                    sourceFile.text.slice(0, node.arguments[1].getStart()),
                    node.arguments[0].getText(),
                    sourceFile.text.slice(node.arguments[1].getEnd()),
                ].join(''),
                expectedDiagnosticCode: '2345',
            })
        } else if (ts.isPropertyAccessChain(node) && b.acquire('2345')) {
            result.push({
                impactedLine: sourceFile.getLineAndCharacterOfPosition(node.name.pos).line,
                newContent: [
                    sourceFile.text.slice(0, node.name.getStart()),
                    'neverGonnaLetMeDown',
                    sourceFile.text.slice(node.name.getEnd()),
                ].join(''),
                expectedDiagnosticCode: '2345',
            })
        } else {
            ts.forEachChild(node, child => loop(child))
        }
    }
    loop(sourceFile)

    return result
}

const findReturn = (node: ts.Node): ts.ReturnStatement | undefined => {
    if (ts.isReturnStatement(node)) {
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

function isBasicTypeRef(node: ts.TypeNode): boolean {
    if (ts.isArrayTypeNode(node)) {
        return isBasicTypeRef(node.elementType)
    }
    if (ts.isUnionTypeNode(node)) {
        return node.types.some(isBasicTypeRef)
    }
    return ts.isIdentifier(node) || ts.isTypeReferenceNode(node)
}
