import { isAbortError } from '../../sourcegraph-api/errors'
import type { GenericVSCodeWrapper, GenericWebviewAPIWrapper } from './proxy'
import type { WebviewToExtensionAPI } from './webviewAPI'

export type WithAbortSignalAsLastArg<T> = {
    [K in keyof T]: T[K] extends (...args: infer P) => infer R
        ? (...args: [...P, signal: AbortSignal]) => R
        : T[K]
}

export type RequestMessage =
    | {
          /**
           * If defined, this request is expecting an AsyncIterator (multiple emitted values) in response.
           * The streamId is a unique and opaque identifier that all responses will be associated with so
           * that the caller can associate them with this request.
           *
           * If `undefined`, the request is expecting a Promise (single emitted value), and no stream is
           * needed.
           */
          streamId?: string

          /**
           * The name of the method to invoke.
           */
          method: string

          /**
           * The method arguments.
           */
          args: unknown[]
      }
    | {
          /** The streamId to abort.* */
          streamId: string

          abort: true
      }

export interface ResponseMessage {
    /**
     * If defined, this response is an emitted value (or error/completion event) from a request that
     * expects an AsyncIterator (multiple emitted values). All responses to that request use the same
     * `streamId` as the request so they can be associated with it.
     *
     * If `undefined`, this response is a single value (like a Promise).
     */
    streamId?: string

    streamEvent?: 'next' | 'error' | 'complete'

    /**
     * For non-stream responses or for `next`/`error` stream events, the data.
     */
    data?: unknown
}

/**
 * Generate a unique ID for each message stream.
 */
function generateStreamId(): string {
    return Math.random().toString(36).slice(4) + Date.now().toString(36)
}

interface MessageAPI<
    TSend extends RequestMessage | ResponseMessage,
    TReceive extends RequestMessage | ResponseMessage,
> {
    postMessage(data: TSend): void
    addEventListener(
        type: 'message',
        listener: (event: Pick<MessageEvent<TReceive>, 'data'>) => void
    ): void
    removeEventListener(
        type: 'message',
        listener: (event: Pick<MessageEvent<TReceive>, 'data'>) => void
    ): void
}

export function createMessageAPIForExtension<
    TWebviewMessage extends { command: 'rpc/request'; message: RequestMessage },
    TExtensionMessage extends { type: 'rpc/response'; message: ResponseMessage },
>(
    webviewAPI: GenericWebviewAPIWrapper<TWebviewMessage, TExtensionMessage>
): MessageAPI<ResponseMessage, RequestMessage> {
    const listeners: {
        listener: (event: Pick<MessageEvent<RequestMessage>, 'data'>) => void
        dispose: () => void
    }[] = []

    return {
        postMessage: data => {
            console.debug('X->W:', data)
            webviewAPI.postMessage({ type: 'rpc/response', message: data } as TExtensionMessage)
        },
        addEventListener: (type, listener) => {
            if (type === 'message') {
                const dispose = webviewAPI.onMessage(m => {
                    if (m.command === 'rpc/request') {
                        console.debug('W->X:', m.message)
                        listener({ data: m.message })
                    }
                })
                listeners.push({ listener, dispose })
            } else {
                throw new Error(`invalid event type ${type}`)
            }
        },
        removeEventListener: (type, listener) => {
            if (type === 'message') {
                const index = listeners.findIndex(l => l.listener === listener)
                if (index !== -1) {
                    const { dispose } = listeners.splice(index, 1)[0]
                    dispose()
                }
            } else {
                throw new Error(`invalid event type ${type}`)
            }
        },
    }
}

export function createMessageAPIForWebview<
    TExtensionMessage extends { type: 'rpc/response'; message: ResponseMessage },
>(
    vscodeAPI: GenericVSCodeWrapper<
        { command: 'rpc/request'; message: RequestMessage },
        TExtensionMessage
    >
): MessageAPI<RequestMessage, ResponseMessage> {
    const listeners: {
        listener: (event: Pick<MessageEvent<ResponseMessage>, 'data'>) => void
        dispose: () => void
    }[] = []

    return {
        postMessage: data => {
            console.debug('W->X:', data)
            vscodeAPI.postMessage({ command: 'rpc/request', message: data })
        },
        addEventListener: (type, listener) => {
            if (type === 'message') {
                const dispose = vscodeAPI.onMessage(m => {
                    if (m.type === 'rpc/response') {
                        console.debug('X->W:', m.message)
                        listener({ data: m.message })
                    }
                })
                listeners.push({ listener, dispose })
            } else {
                throw new Error(`invalid event type ${type}`)
            }
        },
        removeEventListener: (type, listener) => {
            if (type === 'message') {
                const index = listeners.findIndex(l => l.listener === listener)
                if (index !== -1) {
                    const { dispose } = listeners.splice(index, 1)[0]
                    dispose()
                }
            } else {
                throw new Error(`invalid event type ${type}`)
            }
        },
    }
}

const isWebview = Boolean(typeof window !== 'undefined' && window.document?.body)

/**
 * Send a message and return an AsyncGenerator that will emit the responses.
 */
async function* callExtensionAPI<T>(
    messageAPI: MessageAPI<RequestMessage, ResponseMessage>,
    method: string,
    args: unknown[],
    signal?: AbortSignal
): AsyncGenerator<T> {
    const streamId = generateStreamId()

    // Stream state
    const queue: T[] = []
    let thrown: unknown
    let resolve: (() => void) | undefined
    let reject: ((error: unknown) => void) | undefined
    let finished = false

    // Set up a listener for the messages in the response stream.
    function messageListener({
        data: { streamId: responseStreamId, streamEvent, data },
    }: Pick<MessageEvent<ResponseMessage>, 'data'>): void {
        // If the message is on the stream for this call, emit it.
        if (responseStreamId === streamId) {
            switch (streamEvent) {
                case 'next':
                    queue.push(data as T)
                    resolve?.()
                    resolve = undefined
                    break
                case 'error':
                    thrown = data
                    reject?.(thrown)
                    reject = undefined
                    break
                case 'complete':
                    finished = true
                    resolve?.()
                    resolve = undefined
                    break
            }
        }
    }
    messageAPI.addEventListener('message', messageListener)

    // AbortSignal
    let removeAbortListener: (() => void) | undefined = undefined
    if (signal) {
        const handler = () => {
            resolve?.()
            resolve = undefined
            finished = true

            // Send abort message to peer.
            console.debug(`W->X: aborting stream ${streamId}`)
            messageAPI.postMessage({ streamId, abort: true })
        }
        signal.addEventListener('abort', handler)
        removeAbortListener = () => {
            signal.removeEventListener('abort', handler)
        }
    }

    try {
        messageAPI.postMessage({ streamId, method, args } satisfies RequestMessage)

        // Yield streaming responses.
        while (true) {
            if (queue.length > 0) {
                const value = queue.shift()!
                yield value
            } else if (thrown) {
                throw thrown
            } else if (finished) {
                break
            } else {
                await new Promise<void>((res, rej) => {
                    resolve = res
                    reject = rej
                })
            }
        }
    } finally {
        messageAPI.removeEventListener('message', messageListener)
        removeAbortListener?.()
    }
}

/**
 * Create a proxy for an extension API method.
 */
export function proxyExtensionAPI<M extends keyof WebviewToExtensionAPI>(
    messageAPI: MessageAPI<RequestMessage, ResponseMessage>,
    method: M
): WithAbortSignalAsLastArg<WebviewToExtensionAPI>[M] {
    if (!isWebview) {
        throw new Error('tried to call extension API function from extension itself')
    }
    return (...args: any[]): AsyncGenerator<any> => {
        console.debug(`X->W: call method=${method} args=${JSON.stringify(args.slice(0, -2))}`)
        return callExtensionAPI(messageAPI, method, args.slice(0, -2), args.at(-1))
    }
}

/**
 * Set up the extension to handle API requests from the webview.
 */
export function addMessageListenersForExtensionAPI(
    messageAPI: MessageAPI<ResponseMessage, RequestMessage>,
    api: WithAbortSignalAsLastArg<WebviewToExtensionAPI>
): { dispose: () => void } {
    if (isWebview) {
        throw new Error('must be called from extension')
    }

    function messageListener({ data }: Pick<MessageEvent<RequestMessage>, 'data'>): void {
        if (!('method' in data)) {
            return
        }
        const { streamId, method, args } = data
        if (streamId === undefined) {
            throw new Error('non-AsyncIterator-returning RPC calls are not yet implemented')
        }

        // Listen for abort signal.
        const abortController = new AbortController()
        function abortListener({ data }: Pick<MessageEvent<RequestMessage>, 'data'>) {
            if (!('abort' in data)) {
                return
            }
            const { streamId: abortStreamId } = data
            if (abortStreamId === streamId) {
                console.debug(`X->W: abort signal received for streamId=${streamId}`)
                abortController.abort()
            }
        }
        messageAPI.addEventListener('message', abortListener)
        const disposeAbortListener = () => {
            messageAPI.removeEventListener('message', abortListener)
        }

        const methodImpl = api[method as keyof WebviewToExtensionAPI]
        if (!methodImpl) {
            throw new Error(`invalid RPC call for method ${JSON.stringify(method)}`)
        }
        ;(async () => {
            try {
                for await (const value of methodImpl(...([...args, abortController.signal] as any))) {
                    messageAPI.postMessage({
                        streamId,
                        streamEvent: 'next',
                        data: value,
                    })
                }
                messageAPI.postMessage({ streamId, streamEvent: 'complete' })
            } catch (error) {
                if (isAbortError(error)) {
                    messageAPI.postMessage({
                        streamId,
                        streamEvent: 'complete',
                    })
                    return
                }
                messageAPI.postMessage({
                    streamId,
                    streamEvent: 'error',
                    data: error,
                })
            } finally {
                disposeAbortListener()
            }
        })()
    }

    messageAPI.addEventListener('message', messageListener)

    return {
        dispose: () => {
            messageAPI.removeEventListener('message', messageListener)
        },
    }
}
