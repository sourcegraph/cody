import { parentPort } from 'node:worker_threads'
import type { ParseRequest, ParseResponse } from './protocol'

if (!parentPort) {
    throw new Error('parentPort is not available. This file should only be run in a worker thread.')
}

function parse(request: ParseRequest): ParseResponse {
    return {
        id: request.id,
        tree: 'ast',
    }
}
const parent = parentPort

parentPort.on('message', (message: ParseRequest) => {
    parent.postMessage(parse(message))
})
