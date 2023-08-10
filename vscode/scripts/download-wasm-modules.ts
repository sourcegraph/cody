import fs, { existsSync, mkdirSync, WriteStream } from 'fs'
import http from 'https'
import path from 'path'

import ProgressBar from 'progress'

const WASM_DIRECTORY = path.join(path.resolve(__dirname), '..', 'resources', 'wasm')

const urls = [
    'https://storage.googleapis.com/sourcegraph-assets/cody-wasm/tree-sitter-javascript.wasm',
    'https://storage.googleapis.com/sourcegraph-assets/cody-wasm/tree-sitter-typescript.wasm',
    'https://storage.googleapis.com/sourcegraph-assets/cody-wasm/tree-sitter-tsx.wasm',
    'https://storage.googleapis.com/sourcegraph-assets/cody-wasm/tree-sitter-c_sharp.wasm',
    'https://storage.googleapis.com/sourcegraph-assets/cody-wasm/tree-sitter-cpp.wasm',
    'https://storage.googleapis.com/sourcegraph-assets/cody-wasm/tree-sitter-go.wasm',
    'https://storage.googleapis.com/sourcegraph-assets/cody-wasm/tree-sitter-python.wasm',
    'https://storage.googleapis.com/sourcegraph-assets/cody-wasm/tree-sitter-ruby.wasm',
    'https://storage.googleapis.com/sourcegraph-assets/cody-wasm/tree-sitter-rust.wasm',
    'https://storage.googleapis.com/sourcegraph-assets/cody-wasm/tree-sitter-java.wasm',
    'https://storage.googleapis.com/sourcegraph-assets/cody-wasm/tree-sitter-dart.wasm',
    'https://storage.googleapis.com/sourcegraph-assets/cody-wasm/tree-sitter-php.wasm',
]

export async function main(): Promise<void> {
    const hasStoreDir = existsSync(WASM_DIRECTORY)

    if (!hasStoreDir) {
        mkdirSync(WASM_DIRECTORY)
    }

    const filesToDownload = getMissingFiles(urls)

    if (filesToDownload.length === 0) {
        console.log('All wasm modules are in place, have a good day!')
        return
    }

    console.log(`We miss ${filesToDownload.length} files.`)

    try {
        await Promise.all(filesToDownload.map(downloadFile))
        console.log('All files were successful downloaded, check resources/wasm directory')
        process.exit(0);
    } catch (error) {
        console.error('Some error occurred', error)
        process.exit(1);
    }
}

void main()

function getMissingFiles(urls: string[]): string[] {
    const missingFiles = []

    for (const url of urls) {
        const filePath = getFilePathFromURL(url)
        if (!existsSync(path.resolve(WASM_DIRECTORY, filePath))) {
            missingFiles.push(url)
        }
    }

    return missingFiles
}

function getFilePathFromURL(url: string): string {
    const parts = url.split('/')
    return parts[parts.length - 1]
}

function downloadFile(url: string): Promise<WriteStream> {
    const fileName = getFilePathFromURL(url)

    const downloadDirectory = path.resolve(__dirname, '..', 'resources', 'wasm')
    const file = fs.createWriteStream(path.join(downloadDirectory, fileName))

    return new Promise((resolve, reject) => {
        http.get(url).on('response', res => {
            const contentLength = res.headers?.['content-length'] ?? '0'
            const totalLength = parseInt(contentLength, 10)

            const progress = new ProgressBar(`-> ${fileName} [:bar] :rate/bps :percent :etas`, {
                width: 40,
                complete: '=',
                incomplete: ' ',
                renderThrottle: 1,
                total: totalLength,
            })

            res.on('data', (chunk): void => {
                file.write(chunk)
                progress.tick(chunk.length)
            })
                .on('end', () => {
                    resolve(file.end())
                })
                .on('error', err => {
                    console.log('\n')
                    reject(err)
                })
        })
    })
}
