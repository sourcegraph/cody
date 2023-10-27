import * as child_process from 'node:child_process'

import * as vscode from 'vscode'

import { GraphContextFetcher } from '../../completions/context/context-graph'
import { ContextSnippet } from '../../completions/types'
import { MessageHandler } from '../../jsonrpc/jsonrpc'
import { logDebug, logError } from '../../log'
import { telemetryRecorder } from '../../services/telemetry-v2'

import { downloadBfg } from './download-bfg'

const isTesting = process.env.CODY_TESTING === 'true'

enum ErrorCode {
    OK = 0,
    INVALID_RESULT = 1,
    OTHER_FAILURE = 2,
}

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
    public identifier = 'bfg'
    private loadedBFG: Promise<MessageHandler>
    private didFailLoading = false
    private latestRepoIndexing: Promise<void[]> = Promise.resolve([])
    constructor(context: vscode.ExtensionContext, gitDirectoryUri: (uri: vscode.Uri) => vscode.Uri | undefined) {
        this.loadedBFG = loadBFG(context)

        this.loadedBFG.then(
            () => {},
            error => {
                this.didFailLoading = true
                logDebug('BFG', 'failed to initialize', error)
            }
        )

        const indexedGitDirectories = new Set<string>()
        const didOpenDocumentUri = async (uri: vscode.Uri): Promise<void> => {
            if (this.didFailLoading) {
                return
            }
            const gitdir = gitDirectoryUri(uri)?.toString()
            if (gitdir && !indexedGitDirectories.has(gitdir)) {
                indexedGitDirectories.add(gitdir)
                const bfg = await this.loadedBFG

                const indexingStartTime = Date.now()

                try {
                    await bfg.request('bfg/gitRevision/didChange', { gitDirectoryUri: gitdir })

                    telemetryRecorder.recordEvent('cody.bfg.gitRevision.didChange', 'succeeded', {
                        metadata: {
                            durationMs: Date.now() - indexingStartTime,
                            error: ErrorCode.OK,
                        },
                    })

                    logDebug('BFG', `indexing succeeded in ${Date.now() - indexingStartTime}ms`)
                } catch (error) {
                    telemetryRecorder.recordEvent('cody.bfg.gitRevision.didChange', 'failed', {
                        metadata: {
                            durationMs: Date.now() - indexingStartTime,
                            error: ErrorCode.OTHER_FAILURE,
                        },
                        privateMetadata: {
                            errorMessage: error,
                        },
                    })

                    logError('BFG', `indexing failed in ${Date.now() - indexingStartTime}ms: ${error}`)
                }
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
        if (this.didFailLoading) {
            return []
        }
        const bfg = await this.loadedBFG
        if (!bfg.isAlive()) {
            logDebug('BFG', 'BFG is not alive')
            return []
        }
        await this.latestRepoIndexing
        const contextStartTime = Date.now()

        try {
            const responses = await bfg.request('bfg/contextAtPosition', {
                uri: document.uri.toString(),
                content: (await vscode.workspace.openTextDocument(document.uri)).getText(),
                position: { line: position.line, character: position.character },
                maxChars: 1337, // ignored by BFG server for now
                contextRange,
            })

            // Just in case, handle non-object results
            if (typeof responses !== 'object') {
                telemetryRecorder.recordEvent('cody.bfg.contextAtPosition', 'failed', {
                    metadata: {
                        durationMs: Date.now() - contextStartTime,
                        symbols: 0,
                        files: 0,
                        error: ErrorCode.INVALID_RESULT,
                    },
                    privateMetadata: {
                        errorMessage: 'non-object result',
                    },
                })
                return []
            }

            const symbols = responses?.symbols || []
            const files = responses?.files || []

            telemetryRecorder.recordEvent('cody.bfg.contextAtPosition', 'succeeded', {
                metadata: {
                    durationMs: Date.now() - contextStartTime,
                    symbols: symbols.length,
                    files: files.length,
                    error: ErrorCode.OK,
                },
            })

            return [...symbols, ...files]
        } catch (error) {
            telemetryRecorder.recordEvent('cody.bfg.contextAtPosition', 'failed', {
                metadata: {
                    durationMs: Date.now() - contextStartTime,
                    symbols: 0,
                    files: 0,
                    error: ErrorCode.OTHER_FAILURE,
                },
                privateMetadata: {
                    errorMessage: error,
                },
            })

            logError('BFG', `context fetching failed in ${Date.now() - contextStartTime}ms: ${error}`)

            return []
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
}
