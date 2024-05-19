import type * as vscode from 'vscode'
import type {
    Disposable,
    Logger,
    MessageConnection,
    MessageReader,
    MessageStrategy,
    MessageWriter,
} from 'vscode-jsonrpc'
import {
    BrowserMessageReader,
    BrowserMessageWriter,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'
import type { ContextItem } from '../codebase-context/messages'

export interface RPCOptions {
    hydrate?<T>(value: T): T
    logger?: Logger
}

function toMessageStrategy(options: RPCOptions): MessageStrategy {
    return {
        handleMessage: (message, next): void => {
            next(options.hydrate ? options.hydrate(message) : message)
        },
    }
}

///////////////////////////////////////////////////////////////////////////////
// EXTENSION HOST TO WEBVIEW
///////////////////////////////////////////////////////////////////////////////

/**
 * The VS Code extension host's hooks for communicating with a webview.
 */
interface RawExtHostToWebviewMessageAPI
    extends Pick<vscode.Webview, 'postMessage' | 'onDidReceiveMessage'> {}

export function createConnectionFromExtHostToWebview(
    extHost: RawExtHostToWebviewMessageAPI,
    api: ExtHostAPI,
    options: RPCOptions
): { connection: MessageConnection; proxy: WebviewAPI } & Disposable {
    const connection = createConnectionCommon(
        new BrowserMessageReader(extHost),
        new BrowserMessageWriter(extHost),
        options
    )
    const disposable = handle(connection, api)
    return {
        connection: connection,
        proxy: proxy<WebviewAPI>(connection),
        dispose: () => disposable.dispose(),
    }
}

/**
 * The API that the extension host exposes to the webview.
 */
export interface ExtHostAPI {
    queryContextItems(): Promise<ContextItem[]>
}

///////////////////////////////////////////////////////////////////////////////
// WEBVIEW TO EXTENSION HOST
///////////////////////////////////////////////////////////////////////////////

/**
 * A VS Code webview's hooks for communicating with the extension host.
 */
interface RawWebviewToExtHostMessageAPI {
    globalThis: {
        acquireVsCodeApi: () => { postMessage: (message: unknown) => void }
        addEventListener: (event: 'message', listener: (event: MessageEvent<unknown>) => void) => void
        removeEventListener: (event: 'message', listener: (event: MessageEvent<unknown>) => void) => void
    }
}

export function createConnectionFromWebviewToExtHost(
    webview: RawWebviewToExtHostMessageAPI,
    api: WebviewAPI,
    options: RPCOptions
): { connection: MessageConnection; proxy: ExtHostAPI } & Disposable {
    const connection = createConnectionCommon(
        new BrowserMessageReader(webview),
        new BrowserMessageWriter(webview),
        options
    )
    const disposable = handle(connection, api)
    return { connection, proxy: proxy<ExtHostAPI>(connection), dispose: () => disposable.dispose() }
}

/**
 * The API that the webview exposes to the extension host.
 */
export interface WebviewAPI {
    helloWorld(): Promise<string>
}

///////////////////////////////////////////////////////////////////////////////
// PROXY
///////////////////////////////////////////////////////////////////////////////

function createConnectionCommon(
    reader: MessageReader,
    writer: MessageWriter,
    options: RPCOptions
): MessageConnection {
    return createMessageConnection(reader, writer, options.logger, {
        messageStrategy: toMessageStrategy(options),
    })
}

type API = { [method: string]: (...args: any[]) => any }

function handle<A extends API>(conn: MessageConnection, api: A): Disposable {
    const disposables: Disposable[] = []
    for (const [method, impl] of Object.entries(api)) {
        disposables.push(conn.onRequest(method, impl))
    }
    return {
        dispose: () => {
            for (const disposable of disposables) {
                disposable.dispose()
            }
        },
    }
}

function proxy<A extends API>(
    conn: MessageConnection
): { [M in keyof A]: (...args: Parameters<A[M]>) => Promise<Awaited<ReturnType<A[M]>>> } {
    return new Proxy(Object.create(null), {
        get: (target, prop) => {
            if (typeof prop === 'string') {
                return (...args: any[]) => conn.sendRequest(prop, args)
            }
            return target[prop]
        },
    })
}
