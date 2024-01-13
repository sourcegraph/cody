import fs, { copyFileSync, existsSync, mkdirSync, readdirSync, type WriteStream } from 'fs'
import http from 'https'
import path from 'path'

import ProgressBar from 'progress'

const DIST_DIRECTORY = path.join(__dirname, '../dist')
const WASM_DIRECTORY = path.join(__dirname, '../resources/wasm')

// We have to manually copy this because it's resolved by tree-sitter package
// relative to the current `__dirname` which works fine if we do not bundle `node_modules`
// but fails for the VS Code distribution.
//
// https://github.com/tree-sitter/tree-sitter/discussions/1680
const TREE_SITTER_WASM_FILE = 'tree-sitter.wasm'
const TREE_SITTER_WASM_PATH = require.resolve(`web-tree-sitter/${TREE_SITTER_WASM_FILE}`)

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
        copyFilesToDistDir()
        console.log('All wasm modules are in place, have a good day!')
        return
    }

    console.log(`We are missing ${filesToDownload.length} files.`)

    try {
        await Promise.all(filesToDownload.map(downloadFile))

        // HACK(sqs): Wait for files to be written. Otherwise sometimes the files are copied before
        // they are complete, which causes failures in AutocompleteMatcher.test.ts.
        await new Promise(resolve => setTimeout(resolve, 500))

        copyFilesToDistDir()
        console.log('All files were successful downloaded, check resources/wasm directory')
    } catch (error) {
        console.error('Some error occurred', error)
        process.exit(1)
    }
}

void main()

function copyFilesToDistDir(): void {
    const hasDistDir = existsSync(DIST_DIRECTORY)

    if (!hasDistDir) {
        mkdirSync(DIST_DIRECTORY)
    }

    const files = readdirSync(WASM_DIRECTORY)

    for (const file of files) {
        copyFileSync(path.join(WASM_DIRECTORY, file), path.join(DIST_DIRECTORY, file))
    }

    copyFileSync(TREE_SITTER_WASM_PATH, path.join(DIST_DIRECTORY, TREE_SITTER_WASM_FILE))
}

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
    return parts.at(-1)!
}

function downloadFile(url: string): Promise<WriteStream> {
    const fileName = getFilePathFromURL(url)

    const file = fs.createWriteStream(path.join(WASM_DIRECTORY, fileName))

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
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
