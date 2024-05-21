import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const DIST_DIRECTORY = path.join(__dirname, '../dist')
const WASM_DIRECTORY = path.join(__dirname, '../resources/wasm')
const { DOCUMENT_LANGUAGE_TO_GRAMMAR } = require('../src/tree-sitter/grammars')

// We have to manually copy this because it's resolved by tree-sitter package
// relative to the current `__dirname` which works fine if we do not bundle `node_modules`
// but fails for the VS Code distribution.
//
// https://github.com/tree-sitter/tree-sitter/discussions/1680
const TREE_SITTER_WASM_FILE = 'tree-sitter.wasm'
const TREE_SITTER_WASM_PATH = require.resolve(`web-tree-sitter/${TREE_SITTER_WASM_FILE}`)
const JS_GRAMMAR_PATH = require.resolve('@sourcegraph/tree-sitter-wasms/out/tree-sitter-javascript.wasm')
const GRAMMARS_PATH = path.dirname(JS_GRAMMAR_PATH)

export async function main(): Promise<void> {
    const hasStoreDir = existsSync(WASM_DIRECTORY)

    if (!hasStoreDir) {
        mkdirSync(WASM_DIRECTORY)
    }

    try {
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

    const supportedGrammars: string[] = Object.values(DOCUMENT_LANGUAGE_TO_GRAMMAR)

    for (const file of supportedGrammars) {
        const grammarFilePath = path.join(GRAMMARS_PATH, file)

        copyFileSync(grammarFilePath, path.join(WASM_DIRECTORY, file))
        copyFileSync(grammarFilePath, path.join(DIST_DIRECTORY, file))
    }

    copyFileSync(TREE_SITTER_WASM_PATH, path.join(DIST_DIRECTORY, TREE_SITTER_WASM_FILE))
}
