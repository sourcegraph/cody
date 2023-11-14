import * as child_process from 'node:child_process'

import * as vscode from 'vscode'

import { downloadBfg } from '../../../../graph/bfg/download-bfg'
import { MessageHandler } from '../../../../jsonrpc/jsonrpc'
import { logDebug } from '../../../../log'
import { Repository } from '../../../../repository/builtinGitExtension'
import { gitAPI } from '../../../../repository/repositoryHelpers'
import { ContextRetriever, ContextRetrieverOptions, ContextSnippet } from '../../../types'

// This promise is only used for testing purposes. We don't await on the
// indexing request during autocomplete because we want autocomplete to respond
// quickly even while BFG is indexing.
export let bfgIndexingPromise = Promise.resolve<void>(undefined)

export class BfgRetriever implements ContextRetriever {
    public identifier = 'bfg'
    private loadedBFG: Promise<MessageHandler>
    private didFailLoading = false
    // Keys are repository URIs, values are revisions (commit hashes).
    private indexedRepositoryRevisions = new Map<string, string>()
    constructor(private context: vscode.ExtensionContext) {
        this.loadedBFG = this.loadBFG()

        this.loadedBFG.then(
            () => {},
            error => {
                this.didFailLoading = true
                logDebug('BFG', 'failed to initialize', error)
            }
        )

        bfgIndexingPromise = this.indexOpenGitRepositories()
    }

    private async indexOpenGitRepositories(): Promise<void> {
        const git = gitAPI()
        if (!git) {
            return
        }
        for (const repository of git.repositories) {
            await this.onDidChangeRepository(repository)
        }
        this.context.subscriptions.push(git.onDidOpenRepository(repository => this.onDidChangeRepository(repository)))
        // TODO: handle closed repositories
    }

    private async onDidChangeRepository(repository: Repository): Promise<void> {
        const uri = repository.rootUri.toString()
        const head = repository?.state?.HEAD?.commit
        if (head !== this.indexedRepositoryRevisions.get(uri)) {
            this.indexedRepositoryRevisions.set(uri, head ?? '')
            await this.indexRepository(repository)
        }
    }

    private async indexRepository(repository: Repository): Promise<void> {
        const bfg = await this.loadedBFG
        const indexingStartTime = Date.now()
        // TODO: include commit?
        await bfg.request('bfg/gitRevision/didChange', { gitDirectoryUri: repository.rootUri.toString() })
        logDebug('BFG', `indexing time ${Date.now() - indexingStartTime}ms`)
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
        return bfg
    }
}
