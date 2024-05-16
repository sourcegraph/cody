import ts from 'typescript'
import * as vscode from 'vscode'
import { TestClient } from '../../TestClient'
import type { MessageHandler } from '../../jsonrpc-alias'
import type { ProtocolDiagnostic } from '../../protocol-alias'
import { AggregateBuckets, Buckets } from './Buckets'
import { DiagnosticCode, isDiagnosticCode } from './DiagnosticCode'
import type { EvaluateAutocompleteOptions } from './cody-bench'
import { evaluateEachFile } from './evaluateEachFile'

export async function evaluateFixStrategy(
    messageHandler: MessageHandler,
    options: EvaluateAutocompleteOptions
): Promise<void> {
    const client = TestClient.fromConnection(
        messageHandler.conn,
        vscode.Uri.file(options.workspace),
        options.fixture.name
    )
    let totalCandidates = 0
    const globalBuckets = new Buckets<DiagnosticCode>(1_000)
    let counter = options.testCount
    let correctDiagnostics = 0
    let totalDiagnostics = 0
    // await runVoidCommand(options.installCommand, options.workspace)
    await evaluateEachFile(options, async params => {
        if (counter <= 0) {
            return
        }
        const file = params.uri.fsPath
        const sourceFile = ts.createSourceFile(file, params.content, ts.ScriptTarget.Latest, true)
        const candidates = generateTotallyFakeDiagnostics(sourceFile, globalBuckets)
        client.openFile(params.uri, { text: params.content })
        const { diagnostics: originalDiagnostics } = await client.request('testing/diagnostics', {
            uri: params.uri.toString(),
        })
        if (originalDiagnostics.length > 0) {
            // TODO: investigate why these diagnostics  exist
            return undefined
        }
        totalCandidates += candidates.length
        for (const candidate of candidates) {
            client.changeFile(params.uri, { text: candidate.newContent })
            const { diagnostics } = await client.request('testing/diagnostics', {
                uri: params.uri.toString(),
            })
            totalDiagnostics += diagnostics.length
            counter -= diagnostics.length
            for (const diagnostic of diagnostics) {
                if (
                    isDiagnosticCode(diagnostic.code) &&
                    diagnostic.code !== candidate.expectedDiagnosticCode
                ) {
                    const isRelated = relatedDiagnosticCodes[
                        candidate.expectedDiagnosticCode
                    ]?.includes?.(diagnostic.code)
                    if (isRelated) {
                        // ignore
                    } else {
                        // Wrong diagnostic kind. Ignore it, and optionally uncomment below to debug why
                        // printCandidate(file, candidate)
                        // console.log(prettyDiagnostic(diagnostic))
                    }
                } else {
                    await client.request('testing/publishDiagnostics', { diagnostics: [diagnostic] })
                    const { codeActions } = await client.request('codeActions/provide', {
                        location: diagnostic.location,
                        triggerKind: 'Invoke',
                    })
                    console.log({ codeActions })
                    // TODO: publish diagnostic, trigger code actions
                    correctDiagnostics++
                }
            }
        }
        return undefined
    })
    console.log({ correctDiagnostics, totalDiagnostics, totalCandidates })
    console.log(DiagnosticCode)
}

interface FixCandidate {
    newContent: string
    impactedLine: number
    expectedDiagnosticCode: DiagnosticCode
}

const relatedDiagnosticCodes: Partial<Record<DiagnosticCode, DiagnosticCode[]>> = {
    [DiagnosticCode.TS2322]: [DiagnosticCode.TS2741, DiagnosticCode.TS2739, DiagnosticCode.TS2559],
    [DiagnosticCode.TS2345]: [DiagnosticCode.TS2740, DiagnosticCode.TS2769],
}

// Attempt to synthesize diagnostics matching the examples in
// https://linear.app/sourcegraph/issue/CODY-15/edit-fix-provide-tailored-prompt-information-for-the-most-popular#comment-b4cbeb4f
// The current implementation is naive and generates obviously fake errors that
// don't look like real-world production diagnostics (even if they have the
// right diagnostic code). Ideally, we can build a large corpus of "real world" diagnostics
// that we use instead.
function generateTotallyFakeDiagnostics(
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
            isBasicTypeRef(node.type) &&
            b.peek(DiagnosticCode.TS2322)
        ) {
            const returnNode = findReturn(node)
            if (returnNode?.expression && b.acquire(DiagnosticCode.TS2322)) {
                result.push({
                    impactedLine: sourceFile.getLineAndCharacterOfPosition(returnNode.expression.pos)
                        .line,
                    newContent: [
                        sourceFile.text.slice(0, returnNode.expression.pos),
                        ' /never gonna give you up/',
                        sourceFile.text.slice(returnNode.expression.end),
                    ].join(''),
                    expectedDiagnosticCode: DiagnosticCode.TS2322,
                })
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

const findReturn = (node: ts.Node): ts.ReturnStatement | undefined => {
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

function isBasicTypeRef(node: ts.TypeNode): boolean {
    if (ts.isArrayTypeNode(node)) {
        return isBasicTypeRef(node.elementType)
    }
    if (ts.isUnionTypeNode(node)) {
        return node.types.some(isBasicTypeRef)
    }
    return ts.isIdentifier(node) || ts.isTypeReferenceNode(node)
}

export function prettyDiagnostic(d: ProtocolDiagnostic): string {
    const file = vscode.Uri.parse(d.location.uri).fsPath
    return `${file}:${d.location.range.start.line + 1}:${d.location.range.start.character} ${d.code} ${
        d.message
    }`
}

export function printCandidate(file: string, candidate: FixCandidate): void {
    console.log(`${file}:${candidate.impactedLine} CODE:${candidate.expectedDiagnosticCode}`)
    console.log(
        candidate.newContent
            .split('\n')
            .slice(candidate.impactedLine - 1, candidate.impactedLine + 4)
            .join('\n')
    )
}
