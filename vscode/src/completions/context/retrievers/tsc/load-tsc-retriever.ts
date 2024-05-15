import { logError } from '../../../logger'
import type { TscRetriever } from './tsc-retriever'

let retriever: TscRetriever | undefined
let hasTriedRequire = false

// Loads `TscRetriever` if the `typescript` package is available.  The reason we
// do this is because we mark `typescript` as an external package in our esbuild
// config. The TypeScript compiler adds ~8mb to the bundle size, which slows
// down parsing of the Cody extension. Also, `typescript` is available by
// default in the VS Code extension process, so we don't need to include it when
// we publish with the VSC extension.
export function loadTscRetriever(): TscRetriever | undefined {
    if (hasTriedRequire) {
        return retriever
    }
    hasTriedRequire = true
    try {
        require('typescript')
        const { TscRetriever } = require('./tsc-retriever')
        retriever = new TscRetriever()
        return retriever
    } catch (error) {
        logError(new Error('Could not load tsc retriever', { cause: error }))
        return undefined
    }
}
