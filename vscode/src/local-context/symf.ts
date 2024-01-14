import { execFile as _execFile, spawn } from 'node:child_process'
import fs, { access, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { Mutex } from 'async-mutex'
import { XMLParser } from 'fast-xml-parser'
import { mkdirp } from 'mkdirp'
import * as vscode from 'vscode'

import { isWindows } from '@sourcegraph/cody-shared'
import { type IndexedKeywordContextFetcher, type Result } from '@sourcegraph/cody-shared/src/local-context'
import { type SourcegraphCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'

import { logDebug } from '../log'

import { getSymfPath } from './download-symf'

const execFile = promisify(_execFile)

export class SymfRunner implements IndexedKeywordContextFetcher, vscode.Disposable {
    // The root of all symf index directories
    private indexRoot: string
    private indexLocks: Map<string, RWLock> = new Map()

    private status: IndexStatus = new IndexStatus()

    constructor(
        private context: vscode.ExtensionContext,
        private sourcegraphServerEndpoint: string | null,
        private authToken: string | null,
        private completionsClient: SourcegraphCompletionsClient
    ) {
        const indexRoot = path.join(context.globalStorageUri.fsPath, 'symf', 'indexroot')
        this.indexRoot = indexRoot
    }

    public dispose(): void {
        this.status.dispose()
    }

    public onIndexStart(cb: (e: IndexStartEvent) => void): vscode.Disposable {
        return this.status.onDidStart(cb)
    }

    public onIndexEnd(cb: (e: IndexEndEvent) => void): vscode.Disposable {
        return this.status.onDidEnd(cb)
    }

    public setSourcegraphAuth(endpoint: string | null, authToken: string | null): void {
        this.sourcegraphServerEndpoint = endpoint
        this.authToken = authToken
    }

    private async getSymfInfo(): Promise<{ symfPath: string; serverEndpoint: string; accessToken: string }> {
        const accessToken = this.authToken
        if (!accessToken) {
            throw new Error('SymfRunner.getResults: No access token')
        }
        const serverEndpoint = this.sourcegraphServerEndpoint
        if (!serverEndpoint) {
            throw new Error('SymfRunner.getResults: No Sourcegraph server endpoint')
        }
        const symfPath = await getSymfPath(this.context)
        if (!symfPath) {
            throw new Error('No symf executable')
        }
        return { accessToken, serverEndpoint, symfPath }
    }

    public getResults(userQuery: string, scopeDirs: string[]): Promise<Promise<Result[]>[]> {
        const expandedQuery = expandQuery(this.completionsClient, userQuery)
        return Promise.resolve(scopeDirs.map(scopeDir => this.getResultsForScopeDir(expandedQuery, scopeDir)))
    }

    /**
     * Returns the list of results from symf for a single directory scope.
     * @param keywordQuery is a promise, because query expansion might be an expensive
     * operation that is best done concurrently with querying and (re)building the index.
     */
    private async getResultsForScopeDir(keywordQuery: Promise<string>, scopeDir: string): Promise<Result[]> {
        const maxRetries = 10

        // Run in a loop in case the index is deleted before we can query it
        for (let i = 0; i < maxRetries; i++) {
            await this.getIndexLock(scopeDir).withWrite(async () => {
                await this.unsafeEnsureIndex(scopeDir, { hard: i === 0 })
            })

            let indexNotFound = false
            const stdout = await this.getIndexLock(scopeDir).withRead(async () => {
                // Check again if index exists after we have the read lock
                if (!(await this.unsafeIndexExists(scopeDir))) {
                    indexNotFound = true
                    return ''
                }
                return this.unsafeRunQuery(await keywordQuery, scopeDir)
            })
            if (indexNotFound) {
                continue
            }
            const results = parseSymfStdout(stdout)
            return results
        }
        throw new Error(`failed to find index after ${maxRetries} tries for directory ${scopeDir}`)
    }

    public async deleteIndex(scopeDir: string): Promise<void> {
        await this.getIndexLock(scopeDir).withWrite(async () => {
            await this.unsafeDeleteIndex(scopeDir)
        })
    }

    public async getIndexStatus(scopeDir: string): Promise<'unindexed' | 'indexing' | 'ready' | 'failed'> {
        if (this.status.isInProgress(scopeDir)) {
            // Check this before waiting on the lock
            return 'indexing'
        }
        const hasIndex = await this.getIndexLock(scopeDir).withRead(async () => {
            return this.unsafeIndexExists(scopeDir)
        })
        if (hasIndex) {
            return 'ready'
        }
        if (await this.didIndexFail(scopeDir)) {
            return 'failed'
        }
        return 'unindexed'
    }

    public async ensureIndex(scopeDir: string, options: { hard: boolean } = { hard: false }): Promise<void> {
        await this.getIndexLock(scopeDir).withWrite(async () => {
            await this.unsafeEnsureIndex(scopeDir, options)
        })
    }

    private getIndexLock(scopeDir: string): RWLock {
        const { indexDir } = this.getIndexDir(scopeDir)
        let lock = this.indexLocks.get(indexDir)
        if (lock) {
            return lock
        }
        lock = new RWLock()
        this.indexLocks.set(indexDir, lock)
        return lock
    }

    private async unsafeRunQuery(keywordQuery: string, scopeDir: string): Promise<string> {
        const { indexDir } = this.getIndexDir(scopeDir)
        const { accessToken, symfPath, serverEndpoint } = await this.getSymfInfo()
        try {
            const { stdout } = await execFile(
                symfPath,
                ['--index-root', indexDir, 'query', '--scopes', scopeDir, '--fmt', 'json', keywordQuery],
                {
                    env: {
                        SOURCEGRAPH_TOKEN: accessToken,
                        SOURCEGRAPH_URL: serverEndpoint,
                        HOME: process.env.HOME,
                    },
                    maxBuffer: 1024 * 1024 * 1024,
                    timeout: 1000 * 30, // timeout in 30 seconds
                }
            )
            return stdout
        } catch (error) {
            throw toSymfError(error)
        }
    }

    private async unsafeDeleteIndex(scopeDir: string): Promise<void> {
        const trashRootDir = path.join(this.indexRoot, '.trash')
        await mkdirp(trashRootDir)
        const { indexDir } = this.getIndexDir(scopeDir)

        if (!(await fileExists(indexDir))) {
            // index directory no longer exists, nothing to do
            return
        }

        // Unique name for trash directory
        const trashDir = path.join(trashRootDir, `${path.basename(indexDir)}-${Date.now()}`)
        if (await fileExists(trashDir)) {
            // if trashDir already exists, error
            throw new Error(`could not delete index ${indexDir}: target trash directory ${trashDir} already exists`)
        }

        await rename(indexDir, trashDir)
        void rm(trashDir, { recursive: true, force: true }) // delete in background
    }

    private async unsafeIndexExists(scopeDir: string): Promise<boolean> {
        const { indexDir } = this.getIndexDir(scopeDir)
        return fileExists(path.join(indexDir, 'index.json'))
    }

    private async unsafeEnsureIndex(scopeDir: string, options: { hard: boolean } = { hard: false }): Promise<void> {
        const indexExists = await this.unsafeIndexExists(scopeDir)
        if (indexExists) {
            return
        }

        if (!options.hard && (await this.didIndexFail(scopeDir))) {
            // Index build previous failed, so don't try to rebuild
            logDebug('symf', 'index build previously failed and `hard` === false, not rebuilding')
            return
        }

        const { indexDir, tmpDir } = this.getIndexDir(scopeDir)
        try {
            await this.unsafeUpsertIndex(indexDir, tmpDir, scopeDir)
        } catch (error) {
            logDebug('symf', 'symf index creation failed', error)
            await this.markIndexFailed(scopeDir)
            throw error
        }
        await this.clearIndexFailure(scopeDir)
    }

    private getIndexDir(scopeDir: string): { indexDir: string; tmpDir: string } {
        let absIndexedDir = path.resolve(scopeDir)
        // On Windows, we can't use an absolute path with a dirve letter inside another path
        // so we remove the colon, so `C:\foo\bar` just becomes `C\foo\bar` which is a valid
        // sub-path in the index.
        if (isWindows() && absIndexedDir[1] === ':') {
            absIndexedDir = absIndexedDir[0] + absIndexedDir.slice(2)
        }
        return {
            indexDir: path.join(this.indexRoot, absIndexedDir),
            tmpDir: path.join(this.indexRoot, '.tmp', absIndexedDir),
        }
    }

    private unsafeUpsertIndex(indexDir: string, tmpIndexDir: string, scopeDir: string): Promise<void> {
        const cancellation = new vscode.CancellationTokenSource()
        const upsert = this._unsafeUpsertIndex(indexDir, tmpIndexDir, scopeDir, cancellation.token)
        this.status.didStart({ scopeDir, done: upsert, cancel: () => cancellation.cancel() })
        void upsert.finally(() => {
            this.status.didEnd({ scopeDir })
            cancellation.dispose()
        })
        return upsert
    }

    private async _unsafeUpsertIndex(
        indexDir: string,
        tmpIndexDir: string,
        scopeDir: string,
        cancellationToken: vscode.CancellationToken
    ): Promise<void> {
        const symfPath = await getSymfPath(this.context)
        if (!symfPath) {
            return
        }
        await Promise.all([
            rm(indexDir, { recursive: true }).catch(() => undefined),
            rm(tmpIndexDir, { recursive: true }).catch(() => undefined),
        ])

        logDebug('symf', 'creating index', indexDir)
        let maxCPUs = 1
        if (os.cpus().length > 4) {
            maxCPUs = 2
        }

        const disposeOnFinish: vscode.Disposable[] = []
        if (cancellationToken.isCancellationRequested) {
            throw new vscode.CancellationError()
        }

        let wasCancelled = false
        let onExit: (() => void) | undefined
        try {
            const proc = spawn(symfPath, ['--index-root', tmpIndexDir, 'add', scopeDir], {
                env: {
                    ...process.env,
                    GOMAXPROCS: `${maxCPUs}`, // use at most one cpu for indexing
                },
                stdio: ['ignore', 'ignore', 'ignore'],
                timeout: 1000 * 60 * 10, // timeout in 10 minutes
            })
            onExit = () => {
                proc.kill('SIGKILL')
            }
            process.on('exit', onExit)

            if (cancellationToken.isCancellationRequested) {
                wasCancelled = true
                proc.kill('SIGKILL')
            } else {
                disposeOnFinish.push(
                    cancellationToken.onCancellationRequested(() => {
                        wasCancelled = true
                        proc.kill('SIGKILL')
                    })
                )
            }

            // wait for proc to finish
            await new Promise<void>((resolve, reject) => {
                proc.on('error', reject)
                proc.on('exit', code => {
                    if (code === 0) {
                        resolve()
                    } else {
                        reject(new Error(`symf exited with code ${code}`))
                    }
                })
            })
            await mkdirp(path.dirname(indexDir))
            await rename(tmpIndexDir, indexDir)
        } catch (error) {
            if (wasCancelled) {
                throw new vscode.CancellationError()
            }
            throw toSymfError(error)
        } finally {
            if (onExit) {
                process.removeListener('exit', onExit)
            }
            disposeOnFinish.forEach(d => d.dispose())
            await rm(tmpIndexDir, { recursive: true, force: true })
        }
    }

    /**
     * Helpers for tracking index failure
     */

    private async markIndexFailed(scopeDir: string): Promise<void> {
        const failureRoot = path.join(this.indexRoot, '.failed')
        await mkdirp(failureRoot)

        const absIndexedDir = path.resolve(scopeDir)
        const failureSentinelFile = path.join(failureRoot, absIndexedDir.replaceAll(path.sep, '__'))

        await writeFile(failureSentinelFile, '')
    }

    private async didIndexFail(scopeDir: string): Promise<boolean> {
        const failureRoot = path.join(this.indexRoot, '.failed')
        const absIndexedDir = path.resolve(scopeDir)
        const failureSentinelFile = path.join(failureRoot, absIndexedDir.replaceAll(path.sep, '__'))
        return fileExists(failureSentinelFile)
    }

    private async clearIndexFailure(scopeDir: string): Promise<void> {
        const failureRoot = path.join(this.indexRoot, '.failed')
        const absIndexedDir = path.resolve(scopeDir)
        const failureSentinelFile = path.join(failureRoot, absIndexedDir.replaceAll(path.sep, '__'))
        await rm(failureSentinelFile, { force: true })
    }
}

export interface IndexStartEvent {
    scopeDir: string
    cancel: () => void
    done: Promise<void>
}

interface IndexEndEvent {
    scopeDir: string
}

class IndexStatus implements vscode.Disposable {
    private startEmitter = new vscode.EventEmitter<IndexStartEvent>()
    private stopEmitter = new vscode.EventEmitter<IndexEndEvent>()
    private inProgressDirs = new Set<string>()

    public dispose(): void {
        this.startEmitter.dispose()
        this.stopEmitter.dispose()
    }

    public didStart(event: IndexStartEvent): void {
        this.inProgressDirs.add(event.scopeDir)
        this.startEmitter.fire(event)
    }

    public didEnd(event: IndexEndEvent): void {
        this.inProgressDirs.delete(event.scopeDir)
        this.stopEmitter.fire(event)
    }

    public onDidStart(cb: (e: IndexStartEvent) => void): vscode.Disposable {
        return this.startEmitter.event(cb)
    }

    public onDidEnd(cb: (e: IndexEndEvent) => void): vscode.Disposable {
        return this.stopEmitter.event(cb)
    }

    public isInProgress(scopeDir: string): boolean {
        return this.inProgressDirs.has(scopeDir)
    }
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath, fs.constants.F_OK)
        return true
    } catch {
        return false
    }
}

function parseSymfStdout(stdout: string): Result[] {
    const results: Result[] = JSON.parse(stdout) as Result[]
    return results.map(result => {
        const { fqname, name, type, doc, exported, lang, file, range, summary } = result

        const { row: startRow, col: startColumn } = range.startPoint
        const { row: endRow, col: endColumn } = range.endPoint

        const startByte = range.startByte
        const endByte = range.endByte

        return {
            fqname,
            name,
            type,
            doc,
            exported,
            lang,
            file,
            summary,
            range: {
                startByte,
                endByte,
                startPoint: {
                    row: startRow,
                    col: startColumn,
                },
                endPoint: {
                    row: endRow,
                    col: endColumn,
                },
            },
        }
    })
}

/**
 * A simple read-write lock.
 *
 * Note: it is possible for an overlapping succession of readers to starve out
 * any writers that are waiting for the mutex to be released. In practice, this
 * is not an issue, because we don't expect the user to issue neverending
 * while trying to update the index.
 */
class RWLock {
    /**
     * Invariants:
     * - if readers > 0, then mu is locked
     * - if readers === 0 and mu is locked, then a writer is holding the lock
     */
    private readers = 0
    private mu = new Mutex()

    public async withRead<T>(fn: () => Promise<T>): Promise<T> {
        while (this.readers === 0) {
            if (this.mu.isLocked()) {
                // If mu is locked at this point, it must be held by the writer.
                // We spin in this case, rather than try to acquire the lock,
                // because multiple readers blocked on acquiring the lock will
                // execute serially when the writer releases the lock (whereas
                // we want all reads to be concurrent).
                await new Promise(resolve => setTimeout(resolve, 100))
                continue
            }
            // No readers or writers: acquire lock for readers
            await this.mu.acquire()
            break
        }
        this.readers++
        try {
            return await fn()
        } finally {
            this.readers--
            if (this.readers === 0) {
                this.mu.release()
            }
        }
    }

    public async withWrite<T>(fn: () => Promise<T>): Promise<T> {
        return this.mu.runExclusive(fn)
    }
}

function toSymfError(error: unknown): Error {
    const errorString = `${error}`
    let errorMessage: string
    if (errorString.includes('ENOENT')) {
        errorMessage = 'symf binary not found. Do you have "cody.experimental.symf.path" set and is it valid?'
    } else if (errorString.includes('401')) {
        errorMessage = `symf: Unauthorized. Is Cody signed in? ${error}`
    } else {
        errorMessage = `symf index creation failed: ${error}`
    }
    return new EvalError(errorMessage)
}

export function expandQuery(completionsClient: SourcegraphCompletionsClient, query: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const streamingText: string[] = []
        completionsClient.stream(
            {
                messages: [
                    {
                        speaker: 'human',
                        text: `You are helping the user search over a codebase. List some filename fragments that would match files relevant to read to answer the user's query. Present your results in an XML list in the following format: <keywords><keyword><value>a single keyword</value><variants>a space separated list of synonyms and variants of the keyword, including acronyms, abbreviations, and expansions</variants><weight>a numerical weight between 0.0 and 1.0 that indicates the importance of the keyword</weight></keyword></keywords>. Here is the user query: <userQuery>${query}</userQuery>`,
                    },
                    { speaker: 'assistant' },
                ],
                maxTokensToSample: 400,
                temperature: 0,
                topK: 1,
                fast: true,
            },
            {
                onChange(text) {
                    streamingText.push(text)
                },
                onComplete() {
                    const text = streamingText.at(-1) ?? ''
                    try {
                        const parser = new XMLParser()
                        const document = parser.parse(text)
                        const keywords: { value?: string; variants?: string; weight?: number }[] =
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                            document?.keywords?.keyword ?? []
                        const result = new Set<string>()
                        for (const { value, variants } of keywords) {
                            if (typeof value === 'string' && value) {
                                result.add(value)
                            }
                            if (typeof variants === 'string') {
                                for (const variant of variants.split(' ')) {
                                    if (variant) {
                                        result.add(variant)
                                    }
                                }
                            }
                        }
                        resolve([...result].sort().join(' '))
                    } catch (error) {
                        reject(error)
                    }
                },
                onError(error) {
                    reject(error)
                },
            }
        )
    })
}
