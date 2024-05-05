import { PromptString, type RangeData, type Result } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { SymfRunner } from '../local-context/symf'

export interface TextSnippet {
    uri: vscode.Uri
    range: RangeData
    text: string
}

export interface Environment {
    /**
     * URIs that correspond to the root directories of the environment workspace
     */
    rootURIs: vscode.Uri[]
    terminal(text: string, shouldExecute?: boolean): Promise<string>
    search(query: string): Promise<TextSnippet[]>

    open(uri: vscode.Uri): Promise<vscode.TextDocument>
    edit(uri: vscode.Uri, callback: (editBuilder: vscode.TextEditorEdit) => void): Promise<boolean>

    searchDocs(query: string): Promise<TextSnippet[]> // TODO
    browser(action: string): Promise<void> // TODO
}

export class LocalVSCodeEnvironment implements Environment {
    constructor(
        public readonly rootURIs: vscode.Uri[],
        private symf: SymfRunner | undefined
    ) {}

    terminal(text: string, shouldExecute?: boolean | undefined): Promise<string> {
        throw new Error('Method not implemented.')
    }
    async search(query: string): Promise<TextSnippet[]> {
        if (!this.symf) {
            throw new Error("Search requires symf, which wasn't available")
        }

        const queryPromptString = PromptString.unsafe_fromUserQuery(query)
        const resultsAcrossRoots = await this.symf.getResults(queryPromptString, this.rootURIs)
        const results: Result[] = (await Promise.all(resultsAcrossRoots)).flatMap(r => r)
        console.log('### symf results for query', query, results)
        return await Promise.all(
            results.map(async ({ file, range: { startPoint, endPoint } }): Promise<TextSnippet> => {
                const range: RangeData = {
                    start: { line: startPoint.row, character: startPoint.col },
                    end: { line: endPoint.row, character: endPoint.col },
                }
                const vscodeRange = new vscode.Range(
                    startPoint.row,
                    startPoint.col,
                    endPoint.row,
                    endPoint.col
                )
                const td = await vscode.workspace.openTextDocument(file)
                const text = td.getText(vscodeRange)
                return {
                    uri: file,
                    range,
                    text,
                }
            })
        )
    }
    open(uri: vscode.Uri): Promise<vscode.TextDocument> {
        throw new Error('Method not implemented.')
    }
    edit(uri: vscode.Uri, callback: (editBuilder: vscode.TextEditorEdit) => void): Promise<boolean> {
        throw new Error('Method not implemented.')
    }
    searchDocs(query: string): Promise<TextSnippet[]> {
        throw new Error('Method not implemented.')
    }
    browser(action: string): Promise<void> {
        throw new Error('Method not implemented.')
    }
}
