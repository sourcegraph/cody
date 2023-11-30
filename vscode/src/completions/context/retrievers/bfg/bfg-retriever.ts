import * as vscode from 'vscode'

import { spawnBfg } from '../../../../graph/bfg/spawn-bfg'
import { MessageHandler } from '../../../../jsonrpc/jsonrpc'
import { logDebug } from '../../../../log'
import { Repository } from '../../../../repository/builtinGitExtension'
import { gitAPI } from '../../../../repository/repositoryHelpers'
import { captureException } from '../../../../services/sentry/sentry'
import { getContextRange } from '../../../doc-context-getters'
import { ContextRetriever, ContextRetrieverOptions, ContextSnippet } from '../../../types'

export class BfgRetriever implements ContextRetriever {
    public identifier = 'bfg'
    private loadedBFG: Promise<MessageHandler>
    private bfgIndexingPromise = Promise.resolve<void>(undefined)
    private awaitIndexing: boolean
    private didFailLoading = false
    // Keys are repository URIs, values are revisions (commit hashes).
    private indexedRepositoryRevisions = new Map<string, string>()
    constructor(private context: vscode.ExtensionContext) {
        this.awaitIndexing = vscode.workspace
            .getConfiguration()
            .get<boolean>('cody.experimental.cody-engine.await-indexing', false)
        this.loadedBFG = this.loadBFG()

        this.loadedBFG.then(
            () => {},
            error => {
                captureException(error)
                this.didFailLoading = true
                logDebug('CodyEngine', 'failed to initialize', error)
            }
        )

        this.bfgIndexingPromise = this.indexOpenGitRepositories()
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
        try {
            await bfg.request('bfg/gitRevision/didChange', { gitDirectoryUri: repository.rootUri.toString() })
            logDebug('CodyEngine', `indexing time ${Date.now() - indexingStartTime}ms`)
        } catch (error) {
            logDebug('CodyEngine', `indexing error ${error}`)
        }
    }

    public async retrieve({
        document,
        position,
        docContext,
        hints,
    }: ContextRetrieverOptions): Promise<ContextSnippet[]> {
        try {
            if (this.didFailLoading) {
                return []
            }
            const bfg = await this.loadedBFG
            if (!bfg.isAlive()) {
                logDebug('CodyEngine', 'not alive')
                return []
            }

            if (this.awaitIndexing) {
                await this.bfgIndexingPromise
            }

            const responses = await bfg.request('bfg/contextAtPosition', {
                uri: document.uri.toString(),
                content: (await vscode.workspace.openTextDocument(document.uri)).getText(),
                position: { line: position.line, character: position.character },
                maxChars: hints.maxChars, // ignored by BFG server for now
                contextRange: getContextRange(document, docContext),
            })

            // Just in case, handle non-object results
            if (typeof responses !== 'object') {
                return []
            }

            return [...(responses?.symbols || []), ...(responses?.files || [])]
        } catch (error) {
            logDebug('CodyEngine:error', `${error}`)
            return []
        }
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
            logDebug('CodyEngine', 'loading bfg')
            this.doLoadBFG(reject).then(
                bfg => resolve(bfg),
                error => {
                    captureException(error)
                    reject(error)
                }
            )
        })
    }

    private async doLoadBFG(reject: (reason?: any) => void): Promise<MessageHandler> {
        const bfg = await spawnBfg(this.context, reject)
        await bfg.request('bfg/initialize', { clientName: 'vscode' })
        return bfg
    }
}
