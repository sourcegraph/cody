import * as vscode from 'vscode'
import { zodToAnthropicSchema } from '../chat-view/handlers/AgenticAnthropicHandler'
import { type GetDiagnosticInput, GetDiagnosticSchema, validateWithZod } from './schema'
import { getWorkspaceFile } from './utils'

// TODO: compare diagnostics before and after edits.
export const diagnosticTool = {
    spec: {
        name: 'get_diagnostic',
        description:
            'Get diagnostics (including errors) from the editor for the file you have used text_editor on. This tool should be used at the end of your response on the files you have edited.',
        input_schema: zodToAnthropicSchema(GetDiagnosticSchema),
    },
    invoke: async (input: GetDiagnosticInput) => {
        const validInput = validateWithZod(GetDiagnosticSchema, input, 'get_diagnostic')

        try {
            const fileInfo = await getWorkspaceFile(validInput.name)
            if (!fileInfo) return ''

            const diagnostics = vscode.languages.getDiagnostics(fileInfo.uri)
            return diagnostics.map(diagnostic => diagnostic.message).join('\n')
        } catch (error) {
            throw new Error(`Failed to get diagnostics for ${input.name}: ${error}`)
        }
    },
}

type WorkspaceDiagnostics = [vscode.Uri, vscode.Diagnostic[]]

const areEquivalent = (
    { code: code1, message: message1, severity: severity1, source: source1 }: vscode.Diagnostic,
    { code: code2, message: message2, severity: severity2, source: source2 }: vscode.Diagnostic
): boolean => code1 === code2 && message1 === message2 && severity1 === severity2 && source1 === source2

export function getDiagnosticsDiff(
    previousDiagnostics: WorkspaceDiagnostics[],
    currentDiagnostics?: WorkspaceDiagnostics[],
    targetDocument?: vscode.Uri
): WorkspaceDiagnostics[] {
    // Create lookup map from previous diagnostics for O(1) access
    const previousDiagnosticsMap = new Map(previousDiagnostics)

    // Get latest diagnostics (either provided or from VSCode API)
    const latestDiagnostics = currentDiagnostics ?? vscode.languages.getDiagnostics()

    // If document is specified, filter to only that document
    const relevantDiagnostics = targetDocument
        ? latestDiagnostics.filter(([uri]) => uri.path === targetDocument.path)
        : latestDiagnostics

    const newDiagnostics: WorkspaceDiagnostics[] = []

    // Process each document's diagnostics
    for (const [uri, currentDocDiagnostics] of relevantDiagnostics) {
        const previousDocDiagnostics = previousDiagnosticsMap.get(uri) || []

        // Find unique diagnostics not in previous set
        const newDocDiagnostics = currentDocDiagnostics.filter(
            current => !previousDocDiagnostics.some(previous => areEquivalent(previous, current))
        )

        // Only add to results if we found new diagnostics
        if (newDocDiagnostics.length > 0) {
            newDiagnostics.push([uri, newDocDiagnostics])
        }
    }

    return newDiagnostics
}
