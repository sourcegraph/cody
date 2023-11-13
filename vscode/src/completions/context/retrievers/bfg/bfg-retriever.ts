import * as child_process from 'node:child_process'

import * as vscode from 'vscode'

import { downloadBfg } from '../../../../graph/bfg/download-bfg'
import { MessageHandler } from '../../../../jsonrpc/jsonrpc'
import { logDebug } from '../../../../log'
import { ContextRetriever, ContextRetrieverOptions, ContextSnippet } from '../../../types'

export class BfgRetriever implements ContextRetriever {
    public identifier = 'bfg'
    private loadedBFG: Promise<MessageHandler>
    private didFailLoading = false
    private latestRepoIndexing: Promise<void[]> = Promise.resolve([])
    private indexedGitDirectories = new Set<string>()
    constructor(
        private context: vscode.ExtensionContext,
        private gitDirectoryUri: (uri: vscode.Uri) => vscode.Uri | undefined
    ) {
        this.loadedBFG = this.loadBFG()

        this.loadedBFG.then(
            () => {},
            error => {
                this.didFailLoading = true
                logDebug('BFG', 'failed to initialize', error)
            }
        )

        this.latestRepoIndexing = Promise.all(
            vscode.window.visibleTextEditors.map(textEditor => this.didOpenDocumentUri(textEditor.document.uri))
        )
        vscode.workspace.onDidOpenTextDocument(document => this.didOpenDocumentUri(document.uri))
    }

    private async didOpenDocumentUri(uri: vscode.Uri): Promise<void> {
        if (this.didFailLoading) {
            return
        }
        const gitdir = this.gitDirectoryUri(uri)?.toString()
        if (gitdir && !this.indexedGitDirectories.has(gitdir)) {
            this.indexedGitDirectories.add(gitdir)
            const bfg = await this.loadedBFG
            const indexingStartTime = Date.now()
            await bfg.request('bfg/gitRevision/didChange', { gitDirectoryUri: gitdir })
            logDebug('BFG', `indexing time ${Date.now() - indexingStartTime}ms`)
        }
    }

    public async retrieve({
        document,
        position,
        docContext,
        hints,
    }: ContextRetrieverOptions): Promise<ContextSnippet[]> {
        if (this.didFailLoading) {
            return []
        }
        const bfg = await this.loadedBFG
        if (!bfg.isAlive()) {
            logDebug('BFG', 'BFG is not alive')
            return []
        }
        await this.latestRepoIndexing

        const responses = await bfg.request('bfg/contextAtPosition', {
            uri: document.uri.toString(),
            content: (await vscode.workspace.openTextDocument(document.uri)).getText(),
            position: { line: position.line, character: position.character },
            maxChars: hints.maxChars,
            contextRange: docContext.contextRange,
        })

        // Just in case, handle non-object results
        if (typeof responses !== 'object') {
            return []
        }

        return [...(responses?.symbols || []), ...(responses?.files || [])]
    }

    public isSupportedForLanguageId(languageId: string): boolean {
        switch (languageId) {
            case 'typescript':
            case 'typescriptreact':
            case 'javascript':
            case 'javascriptreact':
            case 'java':
            case 'go':
            case 'dart':
            case 'python':
            case 'zig':
                return true
            default:
                return false
        }
    }

    public dispose(): void {
        if (this.didFailLoading) {
            return
        }
        this.loadedBFG.then(
            bfg => bfg.request('bfg/shutdown', null),
            () => {}
        )
    }

    // We lazily load BFG to allow the Cody extension to finish activation as
    // quickly as possible.
    private loadBFG(): Promise<MessageHandler> {
        // This is implemented as a custom promise instead of async/await so that we can reject
        // the promise in the 'exit' handler if we fail to start the bfg process for some reason.
        return new Promise<MessageHandler>((resolve, reject) => {
            this.doLoadBFG(reject).then(
                bfg => resolve(bfg),
                error => reject(error)
            )
        })
    }

    private async doLoadBFG(reject: (reason?: any) => void): Promise<MessageHandler> {
        const bfg = new MessageHandler()
        const codyrpc = await downloadBfg(this.context)
        if (!codyrpc) {
            throw new Error(
                'Failed to download BFG binary. To fix this problem, set the "cody.experimental.bfg.path" configuration to the path of your BFG binary'
            )
        }
        const isVerboseDebug = vscode.workspace.getConfiguration().get<boolean>('cody.debug.verbose', false)
        const child = child_process.spawn(codyrpc, { stdio: 'pipe', env: { VERBOSE_DEBUG: `${isVerboseDebug}` } })
        child.stderr.on('data', chunk => {
            logDebug('BFG', 'stderr', chunk.toString())
        })
        child.on('disconnect', () => reject())
        child.on('close', () => reject())
        child.on('error', error => reject(error))
        child.on('exit', code => {
            bfg.exit()
            reject(code)
        })
        child.stderr.pipe(process.stdout)
        child.stdout.pipe(bfg.messageDecoder)
        bfg.messageEncoder.pipe(child.stdin)
        await bfg.request('bfg/initialize', { clientName: 'vscode' })
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            await this.didOpenDocumentUri(folder.uri)
        }
        return bfg
    }
}
