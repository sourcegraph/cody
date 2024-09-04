import path from 'node:path'
import { Worker } from 'node:worker_threads'
import type { ParseRequest, ParseResponse } from './protocol'

type Resolver = (message: any) => void

export class TreeSitterClient {
    private resolver = new Map<string, Resolver>()
    private id = 0
    constructor(private worker: Worker) {
        this.worker.on('message', (message: ParseResponse) => {
            const resolver = this.resolver.get(message?.id)
            if (resolver) {
                resolver(message)
                this.resolver.delete(message.id)
            }
        })
    }
    public parse(params: { code: string; language: string }): Promise<string> {
        return new Promise(resolve => {
            const id = String(++this.id)
            this.resolver.set(id, resolve)
            const request: ParseRequest = { id, code: params.code, language: params.language }
            this.worker.postMessage(request)
        })
    }
}

export function newServer(): TreeSitterClient {
    const filename = path.resolve(path.dirname(__filename), 'tree-sitter-worker.js')
    console.log('filename', filename)
    const worker = new Worker(filename)
    return new TreeSitterClient(worker)
}

const worker = newServer()
worker
    .parse({ code: 'console.log("Hello, world!");', language: 'javascript' })
    .then(result => {
        console.log('result', result)
        process.exit(0)
    })
    .catch(error => {
        console.error('error', error)
        process.exit(1)
    })
