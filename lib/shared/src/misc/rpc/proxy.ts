import { isAbortError } from '../../sourcegraph-api/errors'

export interface GenericVSCodeWrapper<TWebviewMessage, TExtensionMessage> {
    postMessage(message: TWebviewMessage): void
    onMessage(callback: (message: TExtensionMessage) => void): () => void
    getState(): unknown
    setState(newState: unknown): void
}

/**
 * Create a proxy function for use in the webview that "calls" a function in the extension host
 * (which must be a message defined in {@link WebviewMessage}) and returns a promise for the result
 * (which must be a message defined in {@link ExtensionMessage}).
 *
 * @template TWebviewMessage The webview protocol (such as {@link WebviewMessage}).
 * @template TExtensionMessage The extension host protocol (such as {@link ExtensionMessage}).
 */
export function createExtensionAPIProxyInWebview<
    TWebviewMessage extends { command: string; requestId?: number },
    TExtensionMessage extends { type: string; responseId?: number },
    TRequestName extends TWebviewMessage['command'],
    TResponseName extends TExtensionMessage['type'],
>(
    api: GenericVSCodeWrapper<TWebviewMessage, TExtensionMessage>,
    requestName: TRequestName,
    responseName: TResponseName
): (
    params: Omit<Extract<TWebviewMessage, { command: TRequestName }>, 'command'>
) => Promise<Omit<Extract<TExtensionMessage, { type: TResponseName }>, 'type'>> {
    type TRequestParams = Omit<Extract<TWebviewMessage, { command: TRequestName }>, 'command'>
    type TResponseValue = Omit<Extract<TExtensionMessage, { type: TResponseName }>, 'type'>

    // Request ID info is used by consumer and will be sent back by the rpc server
    // in order to determine which message is an actual response for the current
    // request.
    let requestIdCount = 1

    return (params: TRequestParams): Promise<TResponseValue> => {
        const requestId = requestIdCount++
        return new Promise<TResponseValue>((resolve, reject) => {
            api.postMessage({ command: requestName, requestId, ...params } as unknown as TWebviewMessage)

            const dispose = api.onMessage((message: TExtensionMessage) => {
                if (message.type === responseName && message.responseId === requestId) {
                    resolve(message as unknown as TResponseValue)
                    clearTimeout(rejectTimeout)
                    dispose()
                }
            })

            const MAX_WAIT_SECONDS = 15
            const rejectTimeout = setTimeout(() => {
                reject(new Error(`No ${responseName} response after ${MAX_WAIT_SECONDS}s`))
                dispose()
            }, MAX_WAIT_SECONDS * 1000)
        })
    }
}

export interface GenericWebviewAPIWrapper<TWebviewMessage, TExtensionMessage> {
    postMessage(message: TExtensionMessage): void
    postError(error: Error): void
    onMessage(callback: (message: TWebviewMessage) => void): () => void
}

/**
 * Create a handler for use in the extension host that responds to "calls" from a webview proxy
 * function created by {@link createExtensionAPIProxyInWebview}.
 *
 * @template TWebviewMessage The webview protocol (such as {@link WebviewMessage}).
 * @template TExtensionMessage The extension host protocol (such as {@link ExtensionMessage}).
 */
export function handleExtensionAPICallFromWebview<
    TWebviewMessage extends { command: string; requestId?: number },
    TExtensionMessage extends { type: string; responseId?: number },
    TRequestName extends TWebviewMessage['command'],
    TResponseName extends TExtensionMessage['type'],
>(
    api: GenericWebviewAPIWrapper<TWebviewMessage, TExtensionMessage>,
    requestName: TRequestName,
    responseName: TResponseName,
    handler: (
        params: Omit<Extract<TWebviewMessage, { command: TRequestName }>, 'command'>
    ) => Promise<Omit<Extract<TExtensionMessage, { type: TResponseName }>, 'type'>>
): { dispose: () => void } {
    type TRequestParams = Omit<Extract<TWebviewMessage, { command: TRequestName }>, 'command'>
    const dispose = api.onMessage(async message => {
        if (message.command === requestName) {
            try {
                const response = await handler(message as unknown as TRequestParams)
                api.postMessage({
                    type: responseName,
                    responseId: message.requestId,
                    ...response,
                } as unknown as TExtensionMessage)
            } catch (error) {
                if (isAbortError(error)) {
                    return
                }
                api.postError(
                    error instanceof Error
                        ? error
                        : typeof error === 'string'
                          ? new Error(error)
                          : new Error(`Unknown error while handling ${requestName}`)
                )
            }
        }
    })
    return { dispose }
}
