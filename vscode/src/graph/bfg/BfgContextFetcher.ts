import * as child_process from 'node:child_process'

import * as vscode from 'vscode'

import { GraphContextFetcher } from '../../completions/context/context-graph'
import { ContextSnippet } from '../../completions/types'
import { MessageHandler } from '../../jsonrpc/jsonrpc'
import { logDebug } from '../../log'

import { downloadBfg } from './download-bfg'

const isTesting = process.env.CODY_TESTING === 'true'

async function doLoadBFG(context: vscode.ExtensionContext, reject: (reason?: any) => void): Promise<MessageHandler> {
    const bfg = new MessageHandler()
    const codyrpc = await downloadBfg(context)
    if (!codyrpc) {
        throw new Error(
            'Failed to download BFG binary. To fix this problem, set the "cody.experimental.bfg.path" configuration to the path of your BFG binary'
        )
    }
    const child = child_process.spawn(codyrpc, { stdio: 'pipe' })
    child.stderr.on('data', chunk => {
        if (isTesting) {
            console.log(chunk.toString())
        } else {
            logDebug('BFG', 'stderr output', chunk.toString())
        }
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

// We lazily load BFG to allow the Cody extension finish activation as
// quickly as possible.
function loadBFG(context: vscode.ExtensionContext): Promise<MessageHandler> {
    // This is implemented as a custom promise instead of async/await so that we can reject
    // the promise in the 'exit' handler if we fail to start the bfg process for some reason.
    return new Promise<MessageHandler>((resolve, reject) => {
        doLoadBFG(context, reject).then(
            bfg => resolve(bfg),
            error => reject(error)
        )
    })
}

export class BfgContextFetcher implements GraphContextFetcher {
    private loadedBFG: Promise<MessageHandler>
    private latestRepoIndexing: Promise<void[]> = Promise.resolve([])
    constructor(context: vscode.ExtensionContext, gitDirectoryUri: (uri: vscode.Uri) => vscode.Uri | undefined) {
        this.loadedBFG = loadBFG(context)

        this.loadedBFG.then(
            () => {},
            error => logDebug('BFG', 'failed to initialize', error)
        )

        const indexedGitDirectories = new Set<string>()
        const didOpenDocumentUri = async (uri: vscode.Uri): Promise<void> => {
            const gitdir = gitDirectoryUri(uri)?.toString()
            if (gitdir && !indexedGitDirectories.has(gitdir)) {
                indexedGitDirectories.add(gitdir)
                const bfg = await this.loadedBFG
                const indexingStartTime = Date.now()
                await bfg.request('bfg/gitRevision/didChange', { gitDirectoryUri: gitdir })
                logDebug('BFG', `indexing time ${Date.now() - indexingStartTime}ms`)
            }
        }
        this.latestRepoIndexing = Promise.all(
            vscode.window.visibleTextEditors.map(textEditor => didOpenDocumentUri(textEditor.document.uri))
        )
        vscode.workspace.onDidOpenTextDocument(document => didOpenDocumentUri(document.uri))
    }

    public async getContextAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position,
        maxChars: number,
        contextRange?: vscode.Range | undefined
    ): Promise<ContextSnippet[]> {
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
            maxChars: 1337, // ignored by BFG server for now
            contextRange,
        })

        logDebug('BFG', `graph symbol count ${responses.symbols.length}`)

        return [...responses.symbols, ...responses.files]
    }

    public dispose(): void {
        this.loadedBFG.then(
            bfg => bfg.request('bfg/shutdown', null),
            () => {}
        )
    }
}
