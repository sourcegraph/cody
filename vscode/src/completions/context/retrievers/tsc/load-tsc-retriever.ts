import { logError } from '../../../logger'
import type { TscRetriever } from './tsc-retriever'

let retriever: TscRetriever | undefined
let hasTriedRequire = false

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
