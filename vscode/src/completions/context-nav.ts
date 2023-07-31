import * as vscode from 'vscode'

import { ReferenceSnippet } from './context'

interface Options {
    document: vscode.TextDocument
    position: vscode.Position
}

const enabled = true // debugging

export async function getContextFromCodeNav(options: Options): Promise<ReferenceSnippet[]> {
    const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider',
        options.document.uri
    )

    const allRangePromises: Thenable<(vscode.Location | vscode.LocationLink)[]>[] = []
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
                if (match.index) {
                    allRangePromises.push(
                        vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
                            'vscode.executeDefinitionProvider',
                            options.document.uri,
                            new vscode.Position(lineIndex, match.index)
                        )
                    )
                }
            }

            lineIndex++
        }
    }

    // Resolve all definitions in parallel
    const allRanges = (await Promise.all(allRangePromises))
        .flat()
        .map(m => (isLocationLink(m) ? new vscode.Location(m.targetUri, m.targetRange) : m))

    // Load all files and folding ranges in parallel
    const allUris = allRanges.map(r => r.uri)
    const uris = dedupeWith(allUris, uri => uri.fsPath)
    const contentMap = new Map(
        uris.map(uri => [uri, vscode.workspace.openTextDocument(uri.fsPath).then(d => d.getText())])
    )
    // Note: must actually open all documents before asking for metadata - force resolution here
    await Promise.all([...contentMap.values()])
    const foldingRangesMap = new Map(
        uris.map(uri => [
            uri,
            vscode.commands.executeCommand<vscode.FoldingRange[]>('vscode.executeFoldingRangeProvider', uri),
        ])
    )

    const snippets: ReferenceSnippet[] = []
    for (const uri of uris) {
        const contentPromise = contentMap.get(uri)
        const foldingRangesPromise = foldingRangesMap.get(uri)
        if (!contentPromise || !foldingRangesPromise) {
            continue
        }

        const content = await contentPromise
        const foldingRanges = await foldingRangesPromise
        const documentRanges = allRanges.filter(r => r.uri === uri).map(r => r.range)
        const documentSnippets = extractSnippets(content, foldingRanges, dedupeWith(documentRanges, rangeKey))

        snippets.push(
            ...documentSnippets.map(content => ({
                fileName: uri.fsPath,
                content,
            }))
        )
    }

    console.log({ snippets })
    if (!enabled) {
        console.log('CONTEXT DISABLED')
        return []
    }
    return snippets
}

function extractSnippets(content: string, foldingRanges: vscode.FoldingRange[], ranges: vscode.Range[]): string[] {
    return foldingRanges
        .filter(fr => ranges.some(r => fr.start <= r.start.line && r.end.line <= fr.end))
        .map(fr =>
            content
                .split('\n')
                .slice(fr.start, fr.end + 3) // ??
                .join('\n')
        )
}

function dedupeWith<T>(items: T[], keyFn: (item: T) => string): T[] {
    const seen = new Set<string>()

    const result: T[] = []
    for (const item of items) {
        const key = keyFn(item)
        if (!seen.has(key)) {
            seen.add(key)
            result.push(item)
        }
    }

    return result
}

function rangeKey(r: vscode.Range): string {
    return `${r.start.line}:${r.end.line}:${r.start.character}:${r.start.line}`
}

const isLocationLink = (p: any): p is vscode.LocationLink => !!p.targetUri
