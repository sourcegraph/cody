import syncfs from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import axios from 'axios'
import unzipper from 'unzipper'
import type * as vscode from 'vscode'
import { logDebug } from '../log'

export async function pathExists(path: string): Promise<boolean> {
    try {
        await fs.access(path)
        return true
    } catch {
        return false
    }
}

/**
 * Determines wether the path exists and it is a file
 * @param path
 * @returns file exists at the specified path
 */
export async function fileExists(path: string): Promise<boolean> {
    try {
        const stat = await fs.stat(path)
        return stat.isFile()
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            return false
        }
        //throw on other errors
        throw err
    }
}

/**
 * Atomically creates the file if it does not exist but leaves it untouched otherwise.
 * @param filePath the file to create/touch
 * @param maxMtimeMs if the file hasn't been touched for maxMtimeMs, a new file will be created instead
 * @returns True if a new file has been created. False if the existing file has been left in place
 */
export async function upsertFile(
    filePath: string,
    maxMtimeMs?: number,
    cancellationToken?: vscode.CancellationToken
): Promise<boolean> {
    while (!cancellationToken?.isCancellationRequested) {
        try {
            const openFileHandle = await fs.open(filePath, 'wx')
            try {
                await openFileHandle.close()
            } catch {
                /*Ignore*/
            }
            return true
        } catch (error: any) {
            if (error.code !== 'EEXIST') {
                throw error
            }
            if (maxMtimeMs === undefined) {
                return false
            }
            // We now know the file exists but we'll just check that someone has
            // actually been writing to it within the maxAge time span.
            // otherwise we assume it's abandoned and we'll give ourselves

            // Note: this could fail if the file has been deleted by another
            // process right as we check this...I can live with that.
            const fileStats = await fs.stat(filePath)
            const age = Date.now() - fileStats.mtimeMs
            if (age < maxMtimeMs) {
                // this file has not been abandoned
                return false
            }
            logDebug('symf', `file ${filePath} is abandoned, removing it`)
            // we'll just remove the old file and retry. This way if another
            // process was doing the same thing only one should win out
            await fs.unlink(filePath)
        }
    }
    return false
}

/**
 * This downloads a url to a specific location and overwrites the existing file
 * if it exists
 */
export async function downloadFile(
    url: string,
    outputPath: string,
    cancellationToken?: vscode.CancellationToken
): Promise<void> {
    logDebug('Symf', `downloading from URL ${url}`)
    const abort = !cancellationToken ? undefined : new AbortController()
    cancellationToken?.onCancellationRequested(() => abort?.abort())
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        maxRedirects: 10,
        signal: abort?.signal,
    })

    const stream = syncfs.createWriteStream(outputPath, { autoClose: true, flags: 'w' })
    response.data.pipe(stream)

    await new Promise((resolve, reject) => {
        stream.on('finish', resolve)
        stream.on('error', reject)
    })
}

export async function unzip(zipFile: string, destinationDir: string): Promise<void> {
    const zip = syncfs.createReadStream(zipFile).pipe(unzipper.Parse({ forceStream: true }))
    for await (const entry of zip) {
        if (entry.path.endsWith('/')) {
            continue
        }
        entry.pipe(syncfs.createWriteStream(path.join(destinationDir, entry.path)))
    }
}
