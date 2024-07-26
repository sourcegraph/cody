import syncfs from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import axios from 'axios'
import unzipper from 'unzipper'

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
 * This downloads a url to a specific location and overwrites the existing file
 * if it exists
 */
export async function downloadFile(
    url: string,
    outputPath: string,
    signal?: AbortSignal
): Promise<void> {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        maxRedirects: 10,
        signal: signal,
    })

    const stream = syncfs.createWriteStream(outputPath, { autoClose: true, flags: 'w' })
    response.data.pipe(stream)

    await new Promise((resolve, reject) => {
        stream.on('finish', resolve)
        stream.on('error', reject)
        stream.on('close', () => {
            if (!stream.writableFinished) {
                reject(new Error('Stream closed before finishing'))
            }
        })
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
