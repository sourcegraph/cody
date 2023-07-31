import * as vscode from 'vscode'

import { ReferenceSnippet } from './context'

interface Options {
    document: vscode.TextDocument
    position: vscode.Position
}

export async function getContextFromCodeNav(options: Options): Promise<ReferenceSnippet[]> {
    const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider',
        options.document.uri
    )

    const allRanges: vscode.Location[] = []

    for (const foldingRange of foldingRanges) {
        if (foldingRange.end < options.position.line) {
            continue
        }
        if (options.position.line < foldingRange.start) {
            break
        }

        const lines = options.document
            .getText(new vscode.Range(foldingRange.start, 0, foldingRange.end + 1, 0))
            .split('\n')

        let lineIndex = foldingRange.start
        for (const line of lines) {
            for (const match of line.matchAll(/[$A-Z_a-z][\w$]*/g)) {
                if (!match.index) {
                    continue
                }

                allRanges.push(
                    ...(await vscode.commands.executeCommand<vscode.Location[]>(
                        'vscode.executeDefinitionProvider',
                        options.document.uri,
                        new vscode.Position(lineIndex, match.index)
                    ))
                )
            }

            lineIndex++
        }
    }

    const snippets: ReferenceSnippet[] = []
    const uris = dedupeWith(
        allRanges.map(r => r.uri),
        uri => uri.fsPath
    )
    for (const uri of uris) {
        const content = (await vscode.workspace.openTextDocument(uri.fsPath)).getText()

        const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
            'vscode.executeFoldingRangeProvider',
            uri
        )

        snippets.push(
            ...extractSnippets(
                content,
                foldingRanges,
                dedupeWith(
                    allRanges.filter(r => r.uri !== uri).map(r => r.range),
                    r => `${r.start.line}`
                )
            ).map(content => ({ fileName: uri.fsPath, content }))
        )
    }

    console.log(`loaded ${snippets.length} snippets`)
    return snippets
}

function extractSnippets(content: string, foldingRanges: vscode.FoldingRange[], ranges: vscode.Range[]): string[] {
    const frs = foldingRanges.filter(fr => ranges.some(r => fr.start <= r.start.line && r.start.line <= fr.end))
    console.log({ frs: frs.length, rs: ranges.length })
    return frs.map(fr =>
        content
            .split('\n')
            .slice(fr.start, fr.end + 2) // ??
            .join('\n')
    )
}

function dedupeWith<T>(items: T[], keyFn: (item: T) => string): T[] {
    const seen = new Set<string>()

    const result: T[] = []
    for (const item of items) {
        const key = keyFn(item)
        if (seen.has(key)) {
            continue
        }

        seen.add(key)
        result.push(item)
    }

    return result
}
