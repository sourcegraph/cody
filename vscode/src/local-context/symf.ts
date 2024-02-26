import { execFile as _execFile, spawn } from 'node:child_process'
import fs, { access, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { promisify } from 'node:util'

import { Mutex } from 'async-mutex'
import { mkdirp } from 'mkdirp'
import * as vscode from 'vscode'

import {
    type FileURI,
    type IndexedKeywordContextFetcher,
    type Result,
    type SourcegraphCompletionsClient,
    assertFileURI,
    isFileURI,
    isWindows,
    uriBasename,
    uriDirname,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../log'

import { getSymfPath } from './download-symf'
import { symfExpandQuery } from './symfExpandQuery'

const execFile = promisify(_execFile)
const oneDayMillis = 1000 * 60 * 60 * 24

interface CorpusDiff {
    maybeChangedFiles?: boolean
    changedFiles?: string[]
    millisElapsed?: number
}

function parseJSONToCorpusDiff(json: string): CorpusDiff {
    const obj = JSON.parse(json)
    if (obj.maybeChangedFiles === undefined && obj.changedFiles === undefined) {
        throw new Error(`malformed CorpusDiff: ${json}`)
    }
    return obj as CorpusDiff
}

interface IndexOptions {
    retryIfLastAttemptFailed: boolean
    ignoreExisting: boolean
}

export class SymfRunner implements IndexedKeywordContextFetcher, vscode.Disposable {
    // The root of all symf index directories
    private indexRoot: FileURI
    private indexLocks: Map<string, RWLock> = new Map()

    private status: IndexStatus = new IndexStatus()

    constructor(
        private context: vscode.ExtensionContext,
        private sourcegraphServerEndpoint: string | null,
        private authToken: string | null,
        private completionsClient: SourcegraphCompletionsClient
    ) {
        const indexRoot = vscode.Uri.joinPath(context.globalStorageUri, 'symf', 'indexroot').with(
            // On VS Code Desktop, this is a `vscode-userdata:` URI that actually just refers to
            // file system paths.
            vscode.env.uiKind === vscode.UIKind.Desktop ? { scheme: 'file' } : {}
        )

        if (!isFileURI(indexRoot)) {
            throw new Error('symf only supports running on the file system')
        }
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

    private async getSymfInfo(): Promise<{
        symfPath: string
        serverEndpoint: string
        accessToken: string
    }> {
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

    public getResults(userQuery: string, scopeDirs: vscode.Uri[]): Promise<Promise<Result[]>[]> {
        const expandedQuery = symfExpandQuery(this.completionsClient, userQuery)
        return Promise.resolve(
            scopeDirs
                .filter(isFileURI)
                .map(scopeDir => this.getResultsForScopeDir(expandedQuery, scopeDir))
        )
    }

    /**
     * Returns the list of results from symf for a single directory scope.
     * @param keywordQuery is a promise, because query expansion might be an expensive
     * operation that is best done concurrently with querying and (re)building the index.
     */
    private async getResultsForScopeDir(
        keywordQuery: Promise<string>,
        scopeDir: FileURI
    ): Promise<Result[]> {
        const maxRetries = 10

        // Run in a loop in case the index is deleted before we can query it
        for (let i = 0; i < maxRetries; i++) {
            await this.getIndexLock(scopeDir).withWrite(async () => {
                await this.unsafeEnsureIndex(scopeDir, {
                    retryIfLastAttemptFailed: i === 0,
                    ignoreExisting: false,
                })
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

    public async deleteIndex(scopeDir: FileURI): Promise<void> {
        await this.getIndexLock(scopeDir).withWrite(async () => {
            await this.unsafeDeleteIndex(scopeDir)
        })
    }

    public async getIndexStatus(
        scopeDir: FileURI
    ): Promise<'unindexed' | 'indexing' | 'ready' | 'failed'> {
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

    /**
     * Check index freshness and reindex if needed. Currently reindexes daily if changes
     * have been detected.
     */
    public async reindexIfStale(scopeDir: FileURI): Promise<void> {
        logDebug('SymfRunner', 'reindexIfStale', scopeDir.fsPath)
        try {
            const diff = await this.statIndex(scopeDir)
            if (!diff) {
                await this.ensureIndex(scopeDir, {
                    retryIfLastAttemptFailed: false,
                    ignoreExisting: false,
                })
                return
            }
            if (
                (diff.millisElapsed === undefined || diff.millisElapsed > oneDayMillis) &&
                (diff.maybeChangedFiles || (diff.changedFiles && diff.changedFiles.length > 0))
            ) {
                // reindex targeting a temporary directory
                // atomically replace index
                await this.ensureIndex(scopeDir, {
                    retryIfLastAttemptFailed: false,
                    ignoreExisting: true,
                })
            }
        } catch (error) {
            logDebug('SymfRunner', `Error checking freshness of index at ${scopeDir.fsPath}`, error)
        }
    }

    private async statIndex(scopeDir: FileURI): Promise<CorpusDiff | null> {
        const { indexDir } = this.getIndexDir(scopeDir)
        const { symfPath } = await this.getSymfInfo()
        try {
            const { stdout } = await execFile(symfPath, [
                '--index-root',
                indexDir.fsPath,
                'status',
                scopeDir.fsPath,
            ])
            return parseJSONToCorpusDiff(stdout)
        } catch (error) {
            logDebug('SymfRunner', 'symf status error', error)
            return null
        }
    }

    /**
     * Triggers indexing for a scopeDir.
     *
     * Options:
     * - retryIfLastAttemptFailed: if the last indexing run ended in failure, we don't retry
     *   unless this value is true.
     * - ignoreExisting: if an index already exists, we don't reindex unless this value is true.
     *   This should be set to true when we want to update an index because files have changed.
     */
    public async ensureIndex(
        scopeDir: FileURI,
        options: IndexOptions = { retryIfLastAttemptFailed: false, ignoreExisting: false }
    ): Promise<void> {
        await this.getIndexLock(scopeDir).withWrite(async () => {
            await this.unsafeEnsureIndex(scopeDir, options)
        })
    }

    private getIndexLock(scopeDir: FileURI): RWLock {
        const { indexDir } = this.getIndexDir(scopeDir)
        let lock = this.indexLocks.get(indexDir.toString())
        if (lock) {
            return lock
        }
        lock = new RWLock()
        this.indexLocks.set(indexDir.toString(), lock)
        return lock
    }

    private async unsafeRunQuery(keywordQuery: string, scopeDir: FileURI): Promise<string> {
        const { indexDir } = this.getIndexDir(scopeDir)
        const { accessToken, symfPath, serverEndpoint } = await this.getSymfInfo()
        try {
            const { stdout } = await execFile(
                symfPath,
                [
                    '--index-root',
                    indexDir.fsPath,
                    'query',
                    '--scopes',
                    scopeDir.fsPath,
                    '--fmt',
                    'json',
                    keywordQuery,
                ],
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

    private async unsafeDeleteIndex(scopeDir: FileURI): Promise<void> {
        const trashRootDir = vscode.Uri.joinPath(this.indexRoot, '.trash')
        await mkdirp(trashRootDir.fsPath)
        const { indexDir } = this.getIndexDir(scopeDir)

        if (!(await fileExists(indexDir))) {
            // index directory no longer exists, nothing to do
            return
        }

        // Unique name for trash directory
        const trashDir = vscode.Uri.joinPath(trashRootDir, `${uriBasename(indexDir)}-${Date.now()}`)
        if (await fileExists(trashDir)) {
            // if trashDir already exists, error
            throw new Error(
                `could not delete index ${indexDir}: target trash directory ${trashDir} already exists`
            )
        }

        await rename(indexDir.fsPath, trashDir.fsPath)
        void rm(trashDir.fsPath, { recursive: true, force: true }) // delete in background
    }

    private async unsafeIndexExists(scopeDir: FileURI): Promise<boolean> {
        const { indexDir } = this.getIndexDir(scopeDir)
        return fileExists(vscode.Uri.joinPath(indexDir, 'index.json'))
    }

    private async unsafeEnsureIndex(scopeDir: FileURI, options: IndexOptions): Promise<void> {
        logDebug('SymfRunner', 'unsafeEnsureIndex', scopeDir.toString(), { verbose: { options } })
        if (!options.ignoreExisting) {
            const indexExists = await this.unsafeIndexExists(scopeDir)
            if (indexExists) {
                return
            }
        }

        if (!options.retryIfLastAttemptFailed && (await this.didIndexFail(scopeDir))) {
            // Index build previous failed, so don't try to rebuild
            logDebug(
                'symf',
                'index build previously failed and retryIfLastAttemptFailed=false, not rebuilding'
            )
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

    private getIndexDir(scopeDir: FileURI): { indexDir: FileURI; tmpDir: FileURI } {
        let indexSubdir = scopeDir.path

        // On Windows, we can't use an absolute path with a drive letter inside another path
        // so we remove the colon, so `/c:/foo/` becomes `/c/foo` and `/c%3A/foo` becomes `/c/foo`.
        if (isWindows()) {
            if (indexSubdir[2] === ':') {
                indexSubdir = indexSubdir.slice(0, 2) + indexSubdir.slice(3)
            } else if (indexSubdir.slice(2, 5) === '%3A') {
                indexSubdir = indexSubdir.slice(0, 2) + indexSubdir.slice(5)
            }
        }

        return {
            indexDir: assertFileURI(vscode.Uri.joinPath(this.indexRoot, indexSubdir)),
            tmpDir: assertFileURI(vscode.Uri.joinPath(this.indexRoot, '.tmp', indexSubdir)),
        }
    }

    private unsafeUpsertIndex(
        indexDir: FileURI,
        tmpIndexDir: FileURI,
        scopeDir: FileURI
    ): Promise<void> {
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
        indexDir: FileURI,
        tmpIndexDir: FileURI,
        scopeDir: FileURI,
        cancellationToken: vscode.CancellationToken
    ): Promise<void> {
        const symfPath = await getSymfPath(this.context)
        if (!symfPath) {
            return
        }
        await rm(tmpIndexDir.fsPath, { recursive: true }).catch(() => undefined)

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
            const proc = spawn(symfPath, ['--index-root', tmpIndexDir.fsPath, 'add', scopeDir.fsPath], {
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

            // move just-built index to index path
            await rm(indexDir.fsPath, { recursive: true }).catch(() => undefined)
            await mkdirp(uriDirname(indexDir).fsPath)
            await rename(tmpIndexDir.fsPath, indexDir.fsPath)
        } catch (error) {
            if (wasCancelled) {
                throw new vscode.CancellationError()
            }
            throw toSymfError(error)
        } finally {
            if (onExit) {
                process.removeListener('exit', onExit)
            }
            vscode.Disposable.from(...disposeOnFinish).dispose()
            await rm(tmpIndexDir.fsPath, { recursive: true, force: true })
        }
    }

    /**
     * Helpers for tracking index failure
     */

    private async markIndexFailed(scopeDir: FileURI): Promise<void> {
        const failureRoot = vscode.Uri.joinPath(this.indexRoot, '.failed')
        await mkdirp(failureRoot.fsPath)
        const failureSentinelFile = vscode.Uri.joinPath(failureRoot, scopeDir.path.replaceAll('/', '__'))
        await writeFile(failureSentinelFile.fsPath, '')
    }

    private async didIndexFail(scopeDir: FileURI): Promise<boolean> {
        const failureRoot = vscode.Uri.joinPath(this.indexRoot, '.failed')
        const failureSentinelFile = vscode.Uri.joinPath(failureRoot, scopeDir.path.replaceAll('/', '__'))
        return fileExists(failureSentinelFile)
    }

    private async clearIndexFailure(scopeDir: FileURI): Promise<void> {
        const failureRoot = vscode.Uri.joinPath(this.indexRoot, '.failed')
        const failureSentinelFile = vscode.Uri.joinPath(failureRoot, scopeDir.path.replaceAll('/', '__'))
        await rm(failureSentinelFile.fsPath, { force: true })
    }
}

export interface IndexStartEvent {
    scopeDir: FileURI
    cancel: () => void
    done: Promise<void>
}

interface IndexEndEvent {
    scopeDir: FileURI
}

class IndexStatus implements vscode.Disposable {
    private startEmitter = new vscode.EventEmitter<IndexStartEvent>()
    private stopEmitter = new vscode.EventEmitter<IndexEndEvent>()
    private inProgressDirs = new Set<string /* uri.toString() */>()

    public dispose(): void {
        this.startEmitter.dispose()
        this.stopEmitter.dispose()
    }

    public didStart(event: IndexStartEvent): void {
        this.inProgressDirs.add(event.scopeDir.toString())
        this.startEmitter.fire(event)
    }

    public didEnd(event: IndexEndEvent): void {
        this.inProgressDirs.delete(event.scopeDir.toString())
        this.stopEmitter.fire(event)
    }

    public onDidStart(cb: (e: IndexStartEvent) => void): vscode.Disposable {
        return this.startEmitter.event(cb)
    }

    public onDidEnd(cb: (e: IndexEndEvent) => void): vscode.Disposable {
        return this.stopEmitter.event(cb)
    }

    public isInProgress(scopeDir: FileURI): boolean {
        return this.inProgressDirs.has(scopeDir.toString())
    }
}

async function fileExists(file: vscode.Uri): Promise<boolean> {
    if (!isFileURI(file)) {
        throw new Error('only file URIs are supported')
    }
    try {
        await access(file.fsPath, fs.constants.F_OK)
        return true
    } catch {
        return false
    }
}

function parseSymfStdout(stdout: string): Result[] {
    interface RawSymfResult extends Omit<Result, 'file'> {
        file: string
    }
    const results = JSON.parse(stdout) as RawSymfResult[]
    return results.map(result => {
        const { fqname, name, type, doc, exported, lang, file: fsPath, range, summary } = result

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
            file: vscode.Uri.file(fsPath),
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
        } satisfies Result
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
        errorMessage =
            'symf binary not found. Do you have "cody.experimental.symf.path" set and is it valid?'
    } else if (errorString.includes('401')) {
        errorMessage = `symf: Unauthorized. Is Cody signed in? ${error}`
    } else {
        errorMessage = `symf index creation failed: ${error}`
    }
    return new EvalError(errorMessage)
}
