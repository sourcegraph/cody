import { calcSlices } from 'fast-myers-diff'

import ts from 'typescript'
import * as vscode from 'vscode'
import { TestClient } from '../../TestClient'
import type { MessageHandler } from '../../jsonrpc-alias'
import type { ProtocolDiagnostic } from '../../protocol-alias'
import type { EvaluateAutocompleteOptions } from './cody-bench'
import { evaluateEachFile } from './evaluateEachFile'
import { Buckets } from './strategy-fix/Buckets'
import { DiagnosticCode, isDiagnosticCode } from './strategy-fix/DiagnosticCode'
import {
    type FixCandidate,
    generateTotallyFakeDiagnostics,
} from './strategy-fix/generateTotallyFakeDiagnostics'

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
                    await client.request('diagnostics/publish', { diagnostics: [diagnostic] })
                    const { codeActions } = await client.request('codeActions/provide', {
                        location: diagnostic.location,
                        triggerKind: 'Invoke',
                    })
                    const fixAction = codeActions.find(action => action.title === 'Ask Cody to Fix')
                    if (!fixAction || !fixAction.commandID) {
                        console.log('No fix action found')
                        console.log(prettyDiagnostic(diagnostic))
                        continue
                    }
                    const editTask = await client.request('codeActions/trigger', { id: fixAction.id })
                    await client.acceptEditTask(params.uri, editTask)
                    // const newDiagnostics = await client.request('testing/diagnostics', {
                    //     uri: params.uri.toString(),
                    // })
                    const newText = client.workspace.getDocument(params.uri)?.getText() ?? ''
                    console.log(renderUnifiedDiff(params.content.split('\n'), newText.split('\n')))
                    // TODO: publish diagnostic, trigger code actions
                    correctDiagnostics++
                }
            }
        }
        return undefined
    })
    console.log({ correctDiagnostics, totalDiagnostics, totalCandidates })
}

function renderUnifiedDiff(a: string[], b: string[]): string {
    const patch = calcSlices(a, b)
    const out = []
    for (const [kind, text] of patch) {
        const prefix = kind === 0 ? ' ' : kind === 1 ? '+' : '-'
        out.push(`${prefix} ${text}`)
    }
    return out.join('\n')
}

const relatedDiagnosticCodes: Partial<Record<DiagnosticCode, DiagnosticCode[]>> = {
    [DiagnosticCode.TS2322]: [DiagnosticCode.TS2741, DiagnosticCode.TS2739, DiagnosticCode.TS2559],
    [DiagnosticCode.TS2345]: [DiagnosticCode.TS2740, DiagnosticCode.TS2769],
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
