import path from 'node:path'
import { calcSlices } from 'fast-myers-diff'
import { glob } from 'glob'
import * as vscode from 'vscode'
import { fileExists } from '../../../../vscode/src/local-context/download-symf'
import { TestClient } from '../../TestClient'
import type { MessageHandler } from '../../jsonrpc-alias'
import type { ProtocolDiagnostic } from '../../protocol-alias'
import type { EvaluateAutocompleteOptions } from './cody-bench'
import { evaluateEachFile } from './evaluateEachFile'
import { DiagnosticCode } from './strategy-fix/DiagnosticCode'
import type { FixCandidate } from './strategy-fix/generateTotallyFakeDiagnostics'
import { runVoidCommand } from './testTypecheck'

export async function evaluateFixStrategy(
    messageHandler: MessageHandler,
    options: EvaluateAutocompleteOptions
): Promise<void> {
    const client = TestClient.fromConnection(
        messageHandler.conn,
        vscode.Uri.file(options.workspace),
        options.fixture.name
    )
    if (!(await fileExists(path.join(options.workspace, 'node_modules')))) {
        // Run pnpm install only when `node_modules` doesn't exist.
        await runVoidCommand(options.installCommand, options.workspace)
    }
    let totalErrors = 0
    let fixedErrors = 0
    const absoluteFiles = glob.sync(`${options.workspace}/**`, {
        ignore: ['node_modules/**'],
        nodir: true,
    })
    const files = absoluteFiles.map(file => path.relative(options.workspace, file))
    await evaluateEachFile(files, options, async params => {
        client.openFile(params.uri, { text: params.content })
        const { diagnostics } = await client.request('testing/diagnostics', {
            uri: params.uri.toString(),
        })
        await client.request('diagnostics/publish', { diagnostics })
        for (const diagnostic of diagnostics) {
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
            const { diagnostics: newDiagnostics } = await client.request('testing/diagnostics', {
                uri: params.uri.toString(),
            })
            const newText = client.workspace.getDocument(params.uri)?.getText() ?? ''
            console.log({ message: diagnostic.message })
            const isFixed = newDiagnostics.length === 0 && !newText.includes(diagnostic.message)
            console.log(`${params.file}: ${isFixed ? 'Fixed!' : 'Still errors!'}`)
            console.log(renderUnifiedDiff(params.content.split('\n'), newText.split('\n')))
            totalErrors += 1
            if (isFixed) {
                fixedErrors += 1
            }
        }
        return undefined
    })
    console.log({ totalErrors, fixedErrors })
}

function renderUnifiedDiff(a: string[], b: string[]): string {
    const patch = calcSlices(a, b)
    const out = []
    for (const [kind, text] of patch) {
        const prefix = kind === 0 ? ' ' : kind === 1 ? '+' : '-'
        out.push(`${prefix} ${text.join('')}`)
    }
    return out.join('\n')
}

export const relatedDiagnosticCodes: Partial<Record<DiagnosticCode, DiagnosticCode[]>> = {
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
