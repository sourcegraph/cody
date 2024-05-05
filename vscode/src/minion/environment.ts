import { PromptString, type Result } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { SymfRunner } from '../local-context/symf'

export interface TextSnippet {
    uri: vscode.Uri
    range: vscode.Range
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
        private symf: SymfRunner
    ) {}

    terminal(text: string, shouldExecute?: boolean | undefined): Promise<string> {
        throw new Error('Method not implemented.')
    }
    async search(query: string): Promise<TextSnippet[]> {
        const queryPromptString = PromptString.unsafe_fromUserQuery(query)
        const resultsAcrossRoots = await this.symf.getResults(queryPromptString, this.rootURIs)
        const results: Result[] = (await Promise.all(resultsAcrossRoots)).flatMap(r => r)
        return await Promise.all(
            results.map(async ({ file, range: { startPoint, endPoint } }): Promise<TextSnippet> => {
                const range = new vscode.Range(
                    startPoint.row,
                    startPoint.col,
                    endPoint.row,
                    endPoint.col
                )
                const td = await vscode.workspace.openTextDocument(file)
                const text = td.getText(range)
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
