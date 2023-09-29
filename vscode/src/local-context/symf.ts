import { execFile as _execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { mkdirp } from 'mkdirp'
import * as vscode from 'vscode'

import { IndexedKeywordContextFetcher, Result } from '@sourcegraph/cody-shared/src/local-context'

import { logDebug } from '../log'

import { getSymfPath } from './download-symf'

const execFile = promisify(_execFile)

export class SymfRunner implements IndexedKeywordContextFetcher {
    // Indexes in the progress of being built
    private indicesInProgress: Map<string, Promise<void>> = new Map()

    // Which indexes have already been built. Omission does not mean that the index hasn't been built;
    // it just means we haven't yet checked whether the index directory exists on disk.
    private indicesReady: Map<string, boolean> = new Map()

    // The root of all symf index directories
    private indexRoot: string

    constructor(
        private context: vscode.ExtensionContext,
        private authToken: string | null
    ) {
        this.indexRoot = path.join(os.homedir(), '.cody-symf')
    }

    public setAuthToken(authToken: string | null): void {
        this.authToken = authToken
    }

    /**
     * Returns a Promise that resolves to whether the symf index is ready. An index is ready when the index
     * directory exists on disk.
     */
    public async getIndexReady(scopeDir: string, whenReadyFn?: () => void): Promise<boolean> {
        const { indexDir } = this.getIndexDir(scopeDir)
        if (this.indicesReady.get(indexDir)) {
            return true
        }
        const indexFileExists = await fileExists(path.join(indexDir, 'index.json'))

        if (!indexFileExists && whenReadyFn) {
            this.ensureIndexFor(scopeDir)
                .then(whenReadyFn)
                .catch(() => undefined)
        }
        return indexFileExists
    }

    /**
     * Returns the list of results from symf
     */
    public async getResults(query: string, scopeDir: string): Promise<Result[]> {
        const accessToken = this.authToken
        if (!accessToken) {
            throw new Error('SymfRunner.getResults: No access token')
        }

        const indexDir = await this.ensureIndexFor(scopeDir)
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
                        HOME: process.env.HOME,
                    },
                    maxBuffer: 1024 * 1024 * 1024,
                    timeout: 1000 * 30, // timeout in 30secs
                }
            )
            const results = parseSymfStdout(stdout)
            return results
        } catch (error) {
            handleSymfError(error)
            throw error
        }
    }

    // Returns the path to the index directory
    private async ensureIndexFor(scopeDir: string): Promise<string> {
        const { indexDir, tmpDir } = this.getIndexDir(scopeDir)
        const readyAlready = await this.getIndexReady(scopeDir)
        if (readyAlready) {
            return indexDir
        }

        if (this.indicesInProgress.has(indexDir)) {
            try {
                await this.indicesInProgress.get(indexDir)
                return indexDir
            } catch {
                // Retry if previous attempt failed
                this.indicesInProgress.delete(indexDir)
            }
        }
        const newIndexPromise = this.upsertIndex(indexDir, tmpDir, scopeDir)
        this.indicesInProgress.set(indexDir, newIndexPromise)
        return newIndexPromise
            .then(() => {
                this.indicesReady.set(indexDir, true)
                return indexDir
            })
            .catch(error => {
                logDebug('symf', 'symf index creation failed', error)
                throw error
            })
    }

    private getIndexDir(scopeDir: string): { indexDir: string; tmpDir: string } {
        const absIndexedDir = path.resolve(scopeDir)
        return {
            indexDir: path.join(this.indexRoot, absIndexedDir),
            tmpDir: path.join(this.indexRoot, '.tmp', absIndexedDir),
        }
    }

    private async upsertIndex(indexDir: string, tmpIndexDir: string, scopeDir: string): Promise<void> {
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
            handleSymfError(error)
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

function handleSymfError(error: unknown): void {
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
