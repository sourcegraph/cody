import type * as vscode from 'vscode'
import type {
    DataCallback,
    Disposable,
    Logger,
    Message,
    MessageConnection,
    MessageReader,
    MessageStrategy,
    MessageWriter,
} from 'vscode-jsonrpc'
import {
    AbstractMessageReader,
    AbstractMessageWriter,
    BrowserMessageReader,
    BrowserMessageWriter,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'
import type { ContextItem } from '../codebase-context/messages'
import type { MentionQuery } from '../mentions/query'

export interface RPCOptions {
    hydrate?<T>(value: T): T
    logger?: Logger
}

export interface Client<A> {
    connection: MessageConnection
    proxy: A
    disposable: Disposable
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
): Client<WebviewAPI> {
    const connection = createConnectionCommon(
        new WebviewMessageReader(extHost),
        new WebviewMessageWriter(extHost),
        options
    )
    const disposable = handle<ExtHostAPI>(connection, api)
    connection.listen()
    return {
        connection: connection,
        proxy: proxy<WebviewAPI>(connection),
        disposable: combinedDisposable(disposable, connection),
    }
}

// TODO!(sqs)
class WebviewMessageReader extends AbstractMessageReader {
    constructor(readonly webview: vscode.Webview) {
        super()
    }

    listen(callback: DataCallback): Disposable {
        return this.webview.onDidReceiveMessage(data => {
            callback(data)
        })
    }
}

class WebviewMessageWriter extends AbstractMessageWriter implements MessageWriter {
    private errorCount: number

    constructor(readonly webview: vscode.Webview) {
        super()
        this.errorCount = 0
    }

    public async write(msg: Message): Promise<void> {
        try {
            await this.webview.postMessage(msg)
            this.errorCount = 0
        } catch (error) {
            this.handleError(error, msg)
            return Promise.reject(error)
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private handleError(error: any, msg: Message): void {
        this.errorCount++
        this.fireError(error, msg, this.errorCount)
    }

    public end(): void {
        /* empty */
    }
}

/**
 * The API that the extension host exposes to the webview.
 */
export type ExtHostAPI = Copy<{
    queryContextItems(query: MentionQuery): Promise<ContextItem[] | null>
}>

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
): Client<ExtHostAPI> {
    const connection = createConnectionCommon(
        new BrowserMessageReader(webview),
        new BrowserMessageWriter(webview),
        options
    )
    const disposable = handle<WebviewAPI>(connection, api)
    connection.listen()
    return {
        connection,
        proxy: proxy<ExtHostAPI>(connection),
        disposable: combinedDisposable(disposable, connection),
    }
}

function combinedDisposable(...disposables: Disposable[]): Disposable {
    return {
        dispose: () => {
            for (const d of disposables) {
                d.dispose()
            }
        },
    }
}

/**
 * The API that the webview exposes to the extension host.
 */
export type WebviewAPI = Copy<{
    helloWorld(): Promise<string>
}>

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
type Copy<T> = { [K in keyof T]: T[K] }

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

proxy<{ a(): Promise<number> }>(1 as any)
