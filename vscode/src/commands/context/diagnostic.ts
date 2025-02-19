import {
    type ContextItem,
    ContextItemSource,
    TokenCounterUtils,
    displayPath,
    logError,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

type Diagnostics = [vscode.Uri, vscode.Diagnostic[]]

// Cache diagnostics to avoid repeated filtering
const diagnosticsCache = new Map<string, ContextItem>()

export async function getContextFromDiagnostics(): Promise<ContextItem[]> {
    const items: ContextItem[] = []
    try {
        const diagnostics = vscode.languages.getDiagnostics()

        // Process diagnostics in parallel for better performance
        const processedItems = await Promise.all(
            Array.from(diagnostics).map(async ([uri, fileDiagnostics]) => {
                const cacheKey = `${uri.toString()}-${fileDiagnostics.length}`

                // Check cache first
                if (diagnosticsCache.has(cacheKey)) {
                    return diagnosticsCache.get(cacheKey)
                }

                const errors = fileDiagnostics.filter(
                    d => d.severity === vscode.DiagnosticSeverity.Error
                )

                if (errors.length === 0) {
                    return null
                }

                const content = errors.map(d => d.message).join('\n')
                const size = await TokenCounterUtils.countTokens(content)

                const item = {
                    type: 'file' as const,
                    content,
                    uri,
                    source: ContextItemSource.User,
                    size,
                }

                // Cache the result
                diagnosticsCache.set(cacheKey, item)
                return item
            })
        )

        // Filter out null values and add valid items
        items.push(...processedItems.filter((item): item is ContextItem => item !== null))
    } catch (error) {
        logError('getContextFileFromUri', 'failed', { verbose: error })
    }

    return items
}

export function getDiagnosticsForUri(uri: vscode.Uri): vscode.Diagnostic[] {
    return vscode.languages
        .getDiagnostics(uri)
        .filter(d => d.severity !== vscode.DiagnosticSeverity.Error)
}

export function getDiagnosticsForWorkspace(): Diagnostics[] {
    return Array.from(vscode.languages.getDiagnostics()).reduce((result, [uri, fileDiagnostics]) => {
        const problems = fileDiagnostics.filter(d => d.severity !== vscode.DiagnosticSeverity.Error)
        if (problems.length) {
            result.push([uri, problems])
        }
        return result
    }, [] as Diagnostics[])
}

const areDiagnosticsEquivalent = (
    { code: code1, message: message1, severity: severity1, source: source1 }: vscode.Diagnostic,
    { code: code2, message: message2, severity: severity2, source: source2 }: vscode.Diagnostic
): boolean => code1 === code2 && message1 === message2 && severity1 === severity2 && source1 === source2

export function getUpdatedDiagnostics(previous: Diagnostics[], current: Diagnostics[]): Diagnostics[] {
    const cache = new Map(previous)
    return current.flatMap(([uri, currentDiags]) => {
        const previousDiags = cache.get(uri) || []
        const uniqueDiags = currentDiags.filter(
            cur => !previousDiags.some(prev => areDiagnosticsEquivalent(prev, cur))
        )
        return uniqueDiags.length ? [[uri, uniqueDiags]] : []
    })
}

export function getDiagnosticsTextBlock(diagnostics: Diagnostics[]): string {
    return diagnostics
        .map(([uri, fileDiagnostics]) => {
            const diagnosticLines = fileDiagnostics
                .map(d => `[${d.severity}] Line ${d.range.start.line + 1}: ${d.message}`)
                .join('\n')
            return `\`\`\`bash:${displayPath(uri)}\n${diagnosticLines}\n\`\`\``
        })
        .join('\n')
}
