import * as vscode from 'vscode'

import {
    ContextResult,
    IndexedKeywordContextFetcher,
    KeywordContextFetcher,
} from '@sourcegraph/cody-shared/src/local-context'

import { getActiveEditor } from '../editor/active-editor'

export class SymfContextFetcher implements KeywordContextFetcher {
    constructor(private symf: IndexedKeywordContextFetcher) {}

    public async getContext(query: string, numResults: number): Promise<ContextResult[]> {
        console.log('# SymfContextFetcher.getContext', numResults)
        const scopeDirs = getScopeDirs()
        if (scopeDirs.length === 0) {
            return []
        }

        const allResults = await Promise.all(await this.symf.getResults(query, scopeDirs))
        if (allResults.length === 0) {
            return []
        }

        let results = allResults
        if (allResults.length > numResults) {
            results = allResults.slice(0, numResults)
        }

        const textDecoder = new TextDecoder('utf-8')
        return Promise.all(
            results[0].map(async result => {
                const uri = vscode.Uri.file(result.file)
                const fileContents = await vscode.workspace.fs.readFile(uri)
                const rangeContent = textDecoder.decode(
                    fileContents.subarray(result.range.startByte, result.range.endByte)
                )

                return {
                    fileName: result.file,
                    content: rangeContent,
                }
            })
        )
    }

    public getSearchContext(query: string, numResults: number): Promise<ContextResult[]> {
        // TODO: need to implement after removing /search?
        return Promise.resolve([])
    }
}

function getScopeDirs(): string[] {
    const folders = vscode.workspace.workspaceFolders
    if (!folders) {
        return []
    }
    const uri = getActiveEditor()?.document.uri
    if (!uri) {
        return folders.map(f => f.uri.fsPath)
    }
    const currentFolder = vscode.workspace.getWorkspaceFolder(uri)
    if (!currentFolder) {
        return folders.map(f => f.uri.fsPath)
    }

    return [
        currentFolder.uri.fsPath,
        // TODO: maybe support multiple workspace folders
        // ...folders.filter(folder => folder.uri.toString() !== currentFolder.uri.toString()).map(f => f.uri.fsPath),
    ]
}
