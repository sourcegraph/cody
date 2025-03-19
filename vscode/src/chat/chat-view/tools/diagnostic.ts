import { UIToolStatus } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { AgentTool } from '.'
import { validateWithZod } from '../utils/input'
import { zodToolSchema } from '../utils/parse'
import { fileOps } from './file-operations'
import { type GetDiagnosticInput, GetDiagnosticSchema } from './schema'

export const diagnosticTool: AgentTool = {
    spec: {
        name: 'get_diagnostic',
        description:
            'Get diagnostics (including errors) from the editor for the file you have used text_editor on. This tool should be used at the end of your response on the files you have edited.',
        input_schema: zodToolSchema(GetDiagnosticSchema),
    },
    invoke: async ({ name }: GetDiagnosticInput) => {
        validateWithZod(GetDiagnosticSchema, { name }, 'get_diagnostic')

        try {
            const fileInfo = await fileOps.getWorkspaceFile(name)
            if (!fileInfo) {
                return {
                    text: `Cannot find file ${name}.`,
                    output: { type: 'status', status: UIToolStatus.Error, content: 'Failed' },
                }
            }

            const diagnostics = vscode.languages
                .getDiagnostics(fileInfo.uri)
                .filter(d => d.severity === vscode.DiagnosticSeverity.Error)

            const text = diagnostics?.length
                ? `Diagnostics for ${name}:\n${diagnostics.map(d => d.message).join('\n')}`
                : 'Empty'

            return {
                text,
                output: {
                    title: 'Diagnostics',
                    type: 'file-view',
                    status: UIToolStatus.Done,
                    output: {
                        fileName: name,
                        uri: fileInfo.uri,
                        content: text,
                    },
                },
            }
        } catch (error) {
            throw new Error(`Failed to get diagnostics for ${name}: ${error}`)
        }
    },
}

type WorkspaceDiagnostics = [vscode.Uri, vscode.Diagnostic[]]

const areEquivalent = (d1: vscode.Diagnostic, d2: vscode.Diagnostic): boolean =>
    d1.code === d2.code &&
    d1.message === d2.message &&
    d1.severity === d2.severity &&
    d1.source === d2.source

export function getDiagnosticsDiff(
    previousDiagnostics: WorkspaceDiagnostics[],
    currentDiagnostics = vscode.languages.getDiagnostics(),
    targetDocument?: vscode.Uri
): WorkspaceDiagnostics[] {
    const previousMap = new Map(previousDiagnostics)
    const relevantDiagnostics = targetDocument
        ? currentDiagnostics.filter(([uri]) => uri.path === targetDocument.path)
        : currentDiagnostics

    return relevantDiagnostics
        .map(([uri, currentDiagnostics]) => {
            const previousDiagnostics = previousMap.get(uri) || []
            const newDiagnostics = currentDiagnostics
                .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
                .filter(current => !previousDiagnostics.some(prev => areEquivalent(prev, current)))
            return newDiagnostics.length ? ([uri, newDiagnostics] as WorkspaceDiagnostics) : null
        })
        .filter((entry): entry is WorkspaceDiagnostics => entry !== null)
}

export function getErrorDiagnostics(file: vscode.Uri): vscode.Diagnostic[] {
    const diagnostics = vscode.languages.getDiagnostics(file)
    return diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error)
}
