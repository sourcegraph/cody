import assert from 'assert'
import { type ChildProcessWithoutNullStreams } from 'child_process'
import { appendFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { dirname } from 'path'
import { Readable, Writable } from 'stream'

import * as vscode from 'vscode'

import { isRateLimitError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'

import type * as agent from './agent-protocol'
import type * as bfg from './bfg-protocol'
import type * as embeddings from './embeddings-protocol'

type Requests = bfg.Requests & agent.Requests & embeddings.Requests
type Notifications = bfg.Notifications & agent.Notifications & embeddings.Notifications

// This file is a standalone implementation of JSON-RPC for Node.js
// ReadStream/WriteStream, which conventionally map to stdin/stdout.
// The code assumes familiarity with the JSON-RPC specification as documented
// here https://www.jsonrpc.org/specification
// To learn more about how JSON-RPC protocols work, the LSP specification is
// also a good read
// https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/

// String literal types for the names of the Cody Agent protocol methods.
type RequestMethodName = keyof Requests
type NotificationMethodName = keyof Notifications
type MethodName = RequestMethodName | NotificationMethodName

// Parameter type of a request or notification. Note: JSON-RPC methods can only
// accept one parameter. Multiple parameters must be encoded as an array or an
// object.
type ParamsOf<K extends MethodName> = (Requests & Notifications)[K][0]
// Request result types. Note: notifications don't return values.
type ResultOf<K extends RequestMethodName> = Requests[K][1]

type Id = string | number

// Error codes as defined by the JSON-RPC spec.
enum ErrorCode {
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,
    RequestCanceled = -32604,
    RateLimitError = -32000,
}

// Result of an erroneous request, which populates the `error` property instead
// of `result` for successful results.
interface ErrorInfo<T> {
    code: ErrorCode
    message: string
    data: T
}

class JsonrpcError extends Error {
    constructor(public readonly info: ErrorInfo<any>) {
        super()
    }
    public toString(): string {
        return `${this.name}: ${this.message}`
    }
    public get name(): string {
        return ErrorCode[this.info.code]
    }
    public get message(): string {
        if (typeof this.info?.data === 'string') {
            try {
                const data = JSON.parse(this.info.data)
                return `${this.info.message}: ${JSON.stringify(data, null, 2)}`
            } catch {
                // ignore
            }
            return `${this.info.message}: ${this.info.data}`
        }
        return this.info.message
    }
}

// The three different kinds of toplevel JSON objects that get written to the
// wire: requests, request responses, and notifications.
interface RequestMessage<M extends RequestMethodName> {
    jsonrpc: '2.0'
    id: Id
    method: M
    params?: ParamsOf<M>
}
interface ResponseMessage<M extends RequestMethodName> {
    jsonrpc: '2.0'
    id: Id
    result?: ResultOf<M>
    error?: ErrorInfo<any>
}
interface NotificationMessage<M extends NotificationMethodName> {
    jsonrpc: '2.0'
    method: M
    params?: ParamsOf<M>
}
type Message = RequestMessage<any> & ResponseMessage<any> & NotificationMessage<any>

type MessageHandlerCallback = (err: Error | null, msg: Message | null) => void

/**
 * Absolute path to a file where the agent can write low-level debugging logs to
 * trace all incoming/outgoin JSON messages.
 */
const tracePath = process.env.CODY_AGENT_TRACE_PATH ?? ''

class MessageDecoder extends Writable {
    private buffer: Buffer = Buffer.alloc(0)
    private contentLengthRemaining: number | null = null
    private contentBuffer: Buffer = Buffer.alloc(0)

    constructor(public callback: MessageHandlerCallback) {
        super()
        if (tracePath) {
            if (existsSync(tracePath)) {
                rmSync(tracePath)
            }
            mkdirSync(dirname(tracePath), { recursive: true })
        }
    }

    public _write(chunk: Buffer, encoding: string, callback: (error?: Error | null) => void): void {
        this.buffer = Buffer.concat([this.buffer, chunk])

        // We loop through as we could have a double message that requires processing twice
        read: while (true) {
            if (this.contentLengthRemaining === null) {
                const headerString = this.buffer.toString()

                let startIndex = 0
                let endIndex

                // We create this as we might get partial messages
                // so we only want to set the content length
                // once we get the whole thing
                let newContentLength = 0

                const LINE_TERMINATOR = '\r\n'

                while ((endIndex = headerString.indexOf(LINE_TERMINATOR, startIndex)) !== -1) {
                    const entry = headerString.slice(startIndex, endIndex)
                    const [headerName, headerValue] = entry.split(':').map(_ => _.trim())

                    if (headerValue === undefined) {
                        this.buffer = this.buffer.slice(endIndex + LINE_TERMINATOR.length)

                        // Asserts we actually have a valid header with a Content-Length
                        // This state is irrecoverable because the stream is polluted
                        // Also what is the client doing 😭
                        this.contentLengthRemaining = newContentLength
                        assert(
                            isFinite(this.contentLengthRemaining),
                            `parsed Content-Length ${this.contentLengthRemaining} is not a finite number`
                        )
                        continue read
                    }

                    switch (headerName) {
                        case 'Content-Length':
                            newContentLength = parseInt(headerValue, 10)
                            break

                        default:
                            console.error(`Unknown header '${headerName}': ignoring!`)
                            break
                    }

                    startIndex = endIndex + LINE_TERMINATOR.length
                }

                break
            } else {
                if (this.contentLengthRemaining === 0) {
                    try {
                        const data = JSON.parse(this.contentBuffer.toString())
                        this.contentBuffer = Buffer.alloc(0)
                        this.contentLengthRemaining = null
                        if (tracePath) {
                            appendFileSync(tracePath, '<- ' + JSON.stringify(data, null, 4) + '\n')
                        }
                        this.callback(null, data)
                    } catch (error: any) {
                        if (tracePath) {
                            appendFileSync(tracePath, '<- ' + JSON.stringify({ error }, null, 4) + '\n')
                        }
                        process.stderr.write(
                            `jsonrpc.ts: JSON parse error against input '${this.contentBuffer}', contentLengthRemaining=${this.contentLengthRemaining}. Error:\n${error}\n`
                        )
                        // Kill the process to surface the error as early as
                        // possible. Before, we did `this.callback(error, null)`
                        // and it regularly got the agent into an infinite loop
                        // that was difficult to debug.
                        process.exit(1)
                    }

                    continue
                }

                const data = this.buffer.slice(0, this.contentLengthRemaining)

                // If there isn't anymore data, break out of the loop to wait
                // for more chunks to be written to the stream.
                if (data.length === 0) {
                    break
                }

                this.contentBuffer = Buffer.concat([this.contentBuffer, data])
                this.buffer = this.buffer.slice(this.contentLengthRemaining)

                this.contentLengthRemaining -= data.byteLength
            }
        }

        callback()
    }
}

class MessageEncoder extends Readable {
    private buffer: Buffer = Buffer.alloc(0)

    public send(data: any): void {
        if (tracePath) {
            appendFileSync(tracePath, '-> ' + JSON.stringify(data, null, 4) + '\n')
        }
        this.pause()

        const content = Buffer.from(JSON.stringify(data), 'utf-8')
        const header = Buffer.from(`Content-Length: ${content.byteLength}\r\n\r\n`, 'utf-8')
        this.buffer = Buffer.concat([this.buffer, header, content])

        this.resume()
    }

    public _read(size: number): void {
        this.push(this.buffer.slice(0, size))
        this.buffer = this.buffer.slice(size)
    }
}

type RequestCallback<M extends RequestMethodName> = (
    params: ParamsOf<M>,
    cancelToken: vscode.CancellationToken
) => Promise<ResultOf<M>>
type NotificationCallback<M extends NotificationMethodName> = (params: ParamsOf<M>) => void | Promise<void>

/**
 * Only exported API in this file. MessageHandler exposes a public `messageDecoder` property
 * that can be piped with ReadStream/WriteStream.
 */
export class MessageHandler {
    public id = 0
    private requestHandlers: Map<RequestMethodName, RequestCallback<any>> = new Map()
    private cancelTokens: Map<Id, vscode.CancellationTokenSource> = new Map()
    private notificationHandlers: Map<NotificationMethodName, NotificationCallback<any>> = new Map()
    private alive = true
    private processExitedError: () => Error = () => new Error('Process has exited')
    private responseHandlers: Map<
        Id,
        {
            resolve: (params: any) => void
            reject: (params: Error) => void
        }
    > = new Map()
    public isAlive(): boolean {
        return this.alive
    }
    public exit(): void {
        this.alive = false
        const error = this.processExitedError()
        for (const { reject } of this.responseHandlers.values()) {
            reject(error)
        }
    }

    public connectProcess(child: ChildProcessWithoutNullStreams, reject?: (error: Error) => void): void {
        child.on('disconnect', () => {
            reject?.(new Error('disconnect'))
            this.exit()
        })
        child.on('close', () => {
            reject?.(new Error('close'))
            this.exit()
        })
        child.on('error', error => {
            reject?.(error)
            this.exit()
        })
        child.on('exit', code => {
            if (code !== 0) {
                reject?.(new Error(`exit: ${code}`))
            }
            this.exit()
        })
        child.stderr.on('data', data => {
            console.error(`----stderr----\n${data}--------------`)
        })
        child.stdout.pipe(this.messageDecoder)
        this.messageEncoder.pipe(child.stdin)
    }

    // TODO: RPC error handling
    public messageDecoder: MessageDecoder = new MessageDecoder((err: Error | null, msg: Message | null) => {
        if (err) {
            console.error(`Error: ${err}`)
        }
        if (!msg) {
            return
        }

        if (msg.id !== undefined && msg.method) {
            if (typeof msg.id === 'number' && msg.id > this.id) {
                this.id = msg.id + 1
            }

            // Requests have ids and methods
            const handler = this.requestHandlers.get(msg.method)
            if (handler) {
                const cancelToken: vscode.CancellationTokenSource = new vscode.CancellationTokenSource()
                this.cancelTokens.set(msg.id, cancelToken)
                handler(msg.params, cancelToken.token)
                    .then(
                        result => {
                            const data: ResponseMessage<any> = {
                                jsonrpc: '2.0',
                                id: msg.id,

                                result,
                            }
                            this.messageEncoder.send(data)
                        },
                        error => {
                            const message = error instanceof Error ? error.message : `${error}`
                            const stack = error instanceof Error ? `\n${error.stack}` : ''
                            const code = cancelToken.token.isCancellationRequested
                                ? ErrorCode.RequestCanceled
                                : isRateLimitError(error)
                                ? ErrorCode.RateLimitError
                                : ErrorCode.InternalError
                            const data: ResponseMessage<any> = {
                                jsonrpc: '2.0',
                                id: msg.id,
                                error: {
                                    code,
                                    // Include the stack in the message because
                                    // some JSON-RPC bindings like lsp4j don't
                                    // expose access to the `data` property,
                                    // only `message`. The stack is super
                                    // helpful to track down unexpected
                                    // exceptions.
                                    message: `${message}\n${stack}`,
                                    data: JSON.stringify({ error, stack }),
                                },
                            }
                            this.messageEncoder.send(data)
                        }
                    )
                    .finally(() => {
                        this.cancelTokens.get(msg.id)?.dispose()
                        this.cancelTokens.delete(msg.id)
                    })
            } else {
                console.error(`No handler for request with method ${msg.method}`)
            }
        } else if (msg.id !== undefined) {
            // Responses have ids
            const handler = this.responseHandlers.get(msg.id)
            if (handler) {
                if (msg?.error) {
                    handler.reject(new JsonrpcError(msg.error))
                } else {
                    handler.resolve(msg.result)
                }
                this.responseHandlers.delete(msg.id)
            } else {
                console.error(`No handler for response with id ${msg.id}`)
            }
        } else if (msg.method) {
            // Notifications have methods
            if (
                msg.method === '$/cancelRequest' &&
                msg.params &&
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                (typeof msg.params.id === 'string' || typeof msg.params.id === 'number')
            ) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                this.cancelTokens.get(msg.params.id)?.cancel()
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                this.cancelTokens.delete(msg.params.id)
            } else {
                const notificationHandler = this.notificationHandlers.get(msg.method)
                if (notificationHandler) {
                    void notificationHandler(msg.params)
                } else {
                    console.error(`No handler for notification with method ${msg.method}`)
                }
            }
        }
    })

    public messageEncoder: MessageEncoder = new MessageEncoder()

    public registerRequest<M extends RequestMethodName>(method: M, callback: RequestCallback<M>): void {
        this.requestHandlers.set(method, callback)
    }

    public registerNotification<M extends NotificationMethodName>(method: M, callback: NotificationCallback<M>): void {
        this.notificationHandlers.set(method, callback)
    }

    public request<M extends RequestMethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
        if (!this.isAlive()) {
            throw this.processExitedError()
        }
        const id = this.id++

        const data: RequestMessage<M> = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        }
        this.messageEncoder.send(data)

        return new Promise((resolve, reject) => {
            this.responseHandlers.set(id, { resolve, reject })
        })
    }

    public notify<M extends NotificationMethodName>(method: M, params: ParamsOf<M>): void {
        if (!this.isAlive()) {
            throw this.processExitedError()
        }
        const data: NotificationMessage<M> = {
            jsonrpc: '2.0',
            method,
            params,
        }
        this.messageEncoder.send(data)
    }

    /**
     * @returns A JSON-RPC client to interact directly with this agent instance. Useful when we want
     * to use the agent in-process without stdout/stdin transport mechanism.
     */
    public clientForThisInstance(): InProcessClient {
        if (!this.isAlive()) {
            throw this.processExitedError()
        }
        return new InProcessClient(this.requestHandlers, this.notificationHandlers)
    }
}

/**
 * A client for a JSON-RPC {@link MessageHandler} running in the same process.
 */
class InProcessClient {
    constructor(
        private readonly requestHandlers: Map<RequestMethodName, RequestCallback<any>>,
        private readonly notificationHandlers: Map<NotificationMethodName, NotificationCallback<any>>
    ) {}

    public request<M extends RequestMethodName>(
        method: M,
        params: ParamsOf<M>,
        cancelToken: vscode.CancellationToken = new vscode.CancellationTokenSource().token
    ): Promise<ResultOf<M>> {
        const handler = this.requestHandlers.get(method)
        if (handler) {
            return handler(params, cancelToken)
        }
        throw new Error('No such request handler: ' + method)
    }

    public notify<M extends NotificationMethodName>(method: M, params: ParamsOf<M>): void {
        const handler = this.notificationHandlers.get(method)
        if (handler) {
            void handler(params)
            return
        }
        throw new Error('No such notification handler: ' + method)
    }
}
