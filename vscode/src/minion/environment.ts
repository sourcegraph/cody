import * as fspromises from 'node:fs/promises'
import { PromptString, type RangeData, type Result } from '@sourcegraph/cody-shared'
import { isNumber, isString } from 'lodash'
import * as vscode from 'vscode'
import type { SymfRunner } from '../local-context/symf'
import { logDebug } from '../log'

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
    terminal(text: string): Promise<{ out: string; exitCode: number }>
    search(query: string): Promise<TextSnippet[]>

    open(uri: vscode.Uri): Promise<vscode.TextDocument>
    edit(uri: vscode.Uri, callback: (editBuilder: vscode.TextEditorEdit) => void): Promise<boolean>

    searchDocs(query: string): Promise<TextSnippet[]> // TODO
    browser(action: string): Promise<void> // TODO
}

// TODO(beyang): this needs clean-up
export class PoorMansBash {
    // The temporary file used to communicate output
    private outputFile: string
    private term: vscode.Terminal
    constructor() {
        this.outputFile = '/home/beyang/tmp/asdfasdf'
        this.term = vscode.window.createTerminal('Cody Minion', 'bash')
    }

    // TODO(beyang): this should probably be swapped out by a better implementation.
    // Existing flaws:
    // - no way to cancel long-running shell command
    // - timeout is approximtae
    // - not safe to call concurrently
    public async run(
        text: string,
        timeoutMs = 10_000
    ): Promise<{ out: string; exitCode: number; newPwd: string }> {
        await fspromises.writeFile(this.outputFile, '')
        // TODO(beyang): properly escape json output
        const wrapperCmd = `wrapper_8a305819() {
${text}

echo "SENTINEL_b9a87f3bb{ \\\"exitCode\\\": $?, \\\"pwd\\\": \\\"$PWD\\\" }END_SENTINEL_c9a87f3cc"
}

wrapper_8a305819 &> ${this.outputFile}`
        this.term.sendText(wrapperCmd)

        let timeElapsed = 0
        const pollPeriod = 100
        let rawOut: string | undefined = undefined
        while (true) {
            if (timeElapsed > timeoutMs) {
                break
            }
            const r = await fspromises.readFile(this.outputFile, { encoding: 'utf8' })
            const endIdx = r.indexOf('END_SENTINEL_c9a87f3cc')
            if (endIdx >= 0) {
                rawOut = r.slice(0, endIdx)
                break
            }
            await new Promise(resolve => setTimeout(resolve, 100))
            timeElapsed += pollPeriod
        }
        if (rawOut === undefined) {
            throw new Error(`timed out waiting for command "${text}" to finish`)
        }

        const sepIdx = rawOut.indexOf('SENTINEL_b9a87f3bb')
        if (sepIdx === -1) {
            throw new Error('VSCodeTerminal.run: failed to find sentinel value in shell command output')
        }
        const out = rawOut.slice(0, sepIdx)
        const metadataRaw = rawOut.slice(sepIdx + 'SENTINEL_b9a87f3bb'.length)
        let metadata: { exitCode: number; pwd: string } | undefined = undefined
        try {
            const parsed = JSON.parse(metadataRaw)
            if (!isNumber(parsed.exitCode)) {
                throw new Error('field "exitCode" missing')
            }
            if (!isString(parsed.pwd)) {
                throw new Error('field "pwd" missing')
            }
            metadata = parsed as { exitCode: number; pwd: string }
        } catch (e: unknown) {
            throw new Error(
                `VSCodeTerminal.run: failed parse JSON metadata from ${metadataRaw}, error: ${e}`
            )
        }
        return { out, exitCode: metadata?.exitCode ?? 0, newPwd: metadata?.pwd }
    }
}

export class LocalVSCodeEnvironment implements Environment {
    private terminalInstance: PoorMansBash
    constructor(
        public readonly rootURIs: vscode.Uri[],
        private symf: SymfRunner | undefined
    ) {
        this.terminalInstance = new PoorMansBash()
    }

    public async terminal(text: string): Promise<{ out: string; exitCode: number }> {
        const { out, exitCode } = await this.terminalInstance.run(text)
        return { out, exitCode }
    }

    async search(query: string): Promise<TextSnippet[]> {
        if (!this.symf) {
            throw new Error("Search requires symf, which wasn't available")
        }

        const queryPromptString = PromptString.unsafe_fromUserQuery(query)
        const resultsAcrossRoots = await this.symf.getResults(queryPromptString, this.rootURIs)
        const results: Result[] = (await Promise.all(resultsAcrossRoots)).flatMap(r => r)
        return (
            await Promise.all(
                results.map(
                    async ({ file, range: { startPoint, endPoint } }): Promise<TextSnippet[]> => {
                        try {
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
                            return [
                                {
                                    uri: file,
                                    range,
                                    text,
                                },
                            ]
                        } catch (e) {
                            logDebug(
                                'LocalVSCodeEnvironment',
                                'failed to open file from symf result, index may be out-of-date',
                                e
                            )
                            return []
                        }
                    }
                )
            )
        ).flatMap(r => r)
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
