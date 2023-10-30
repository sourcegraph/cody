import { execFile as _execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { Mutex } from 'async-mutex'
import { mkdirp } from 'mkdirp'
import * as vscode from 'vscode'

import { IndexedKeywordContextFetcher, Result } from '@sourcegraph/cody-shared/src/local-context'

import { logDebug } from '../log'

import { getSymfPath } from './download-symf'

const execFile = promisify(_execFile)

export class SymfRunner implements IndexedKeywordContextFetcher {
    // The root of all symf index directories
    private indexRoot: string

    private indexLocks: Map<string, RWLock> = new Map()

    constructor(
        private context: vscode.ExtensionContext,
        private sourcegraphServerEndpoint: string | null,
        private authToken: string | null
    ) {
        this.indexRoot = path.join(os.homedir(), '.cody-symf')
    }

    public setSourcegraphAuth(endpoint: string | null, authToken: string | null): void {
        this.sourcegraphServerEndpoint = endpoint
        this.authToken = authToken
    }

    /**
     * Returns the list of results from symf
     */
    public async getResults(query: string, scopeDir: string): Promise<Result[]> {
        while (true) {
            await this.getIndexLock(scopeDir).withWrite(async () => {
                await this.unsafeEnsureIndex(scopeDir)
            })

            let indexNotFound = false
            const stdout = await this.getIndexLock(scopeDir).withRead(async () => {
                // Check again if index exists after we have the read lock
                if (!(await this.unsafeIndexExists(scopeDir))) {
                    indexNotFound = true
                    return ''
                }
                return this.unsafeRunQuery(query, scopeDir)
            })
            if (indexNotFound) {
                continue
            }
            const results = parseSymfStdout(stdout)
            return results
        }
    }

    public async deleteIndex(scopeDir: string): Promise<void> {
        await this.getIndexLock(scopeDir).withWrite(async () => {
            await this.unsafeDeleteIndex(scopeDir)
        })
    }

    public async ensureIndex(scopeDir: string): Promise<void> {
        await this.getIndexLock(scopeDir).withWrite(async () => {
            await this.unsafeEnsureIndex(scopeDir)
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

    private async unsafeRunQuery(query: string, scopeDir: string): Promise<string> {
        const { indexDir } = this.getIndexDir(scopeDir)
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
        try {
            const { stdout } = await execFile(
                symfPath,
                ['--index-root', indexDir, 'query', '--scopes', scopeDir, '--fmt', 'json', '--natural', query],
                {
                    env: {
                        SOURCEGRAPH_TOKEN: accessToken,
                        SOURCEGRAPH_URL: serverEndpoint,
                        HOME: process.env.HOME,
                    },
                    maxBuffer: 1024 * 1024 * 1024,
                    timeout: 1000 * 30, // timeout in 30secs
                }
            )
            return stdout
        } catch (error) {
            showSymfError(error)
            throw error
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

    private async unsafeEnsureIndex(scopeDir: string): Promise<void> {
        const indexExists = await this.unsafeIndexExists(scopeDir)
        if (indexExists) {
            return
        }

        const { indexDir, tmpDir } = this.getIndexDir(scopeDir)
        try {
            await this.unsafeUpsertIndex(indexDir, tmpDir, scopeDir)
        } catch (error) {
            logDebug('symf', 'symf index creation failed', error)
            throw error
        }
    }

    private getIndexDir(scopeDir: string): { indexDir: string; tmpDir: string } {
        const absIndexedDir = path.resolve(scopeDir)
        return {
            indexDir: path.join(this.indexRoot, absIndexedDir),
            tmpDir: path.join(this.indexRoot, '.tmp', absIndexedDir),
        }
    }

    private async unsafeUpsertIndex(indexDir: string, tmpIndexDir: string, scopeDir: string): Promise<void> {
        const symfPath = await getSymfPath(this.context)
        if (!symfPath) {
            return
        }
        await Promise.all([
            rm(indexDir, { recursive: true }).catch(() => undefined),
            rm(tmpIndexDir, { recursive: true }).catch(() => undefined),
        ])

        logDebug('symf', 'creating index', indexDir)
        const args = ['--index-root', tmpIndexDir, 'add', '--langs', 'go,typescript,python', scopeDir]
        try {
            const proc = spawn(symfPath, args, {
                stdio: ['ignore', 'ignore', 'ignore'],
            })
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
            showSymfError(error)
        }
    }
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK)
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

function showSymfError(error: unknown): void {
    const errorString = `${error}`
    let errorMessage: string
    if (errorString.includes('ENOENT')) {
        errorMessage = 'symf binary not found. Do you have "cody.experimental.symf.path" set and is it valid?'
    } else if (errorString.includes('401')) {
        errorMessage = `symf: Unauthorized. Is Cody signed in? ${error}`
    } else {
        errorMessage = `symf index creation failed: ${error}`
    }
    void vscode.window.showErrorMessage(errorMessage)
}
