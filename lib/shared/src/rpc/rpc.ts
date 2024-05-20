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

function combinedDisposable(...disposables: Disposable[]): Disposable {
    return {
        dispose: () => {
            for (const d of disposables) {
                d.dispose()
            }
        },
    }
}

///////////////////////////////////////////////////////////////////////////////
// EXTENSION HOST TO WEBVIEW
///////////////////////////////////////////////////////////////////////////////

/**
 * The VS Code extension host's hooks for communicating with a webview.
 */
interface ExtHostToWebviewMessageAPI
    extends Pick<vscode.Webview, 'postMessage' | 'onDidReceiveMessage'> {}

export function createConnectionFromExtHostToWebview(
    webview: ExtHostToWebviewMessageAPI,
    api: ExtHostAPI,
    options: RPCOptions
): Client<WebviewAPI> {
    const connection = createConnectionCommon(
        new ExtHostMessageReader(webview),
        new ExtHostMessageWriter(webview),
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

class ExtHostMessageReader extends AbstractMessageReader {
    constructor(private readonly webview: Pick<vscode.Webview, 'onDidReceiveMessage'>) {
        super()
    }

    listen(callback: DataCallback): Disposable {
        return this.webview.onDidReceiveMessage(data => {
            if (isMessage(data)) {
                callback(data)
            }
        })
    }
}

function isMessage(value: unknown): value is Message {
    return Boolean(value && typeof value === 'object' && 'jsonrpc' in value)
}

class ExtHostMessageWriter extends AbstractMessageWriter {
    private errorCount = 0

    constructor(readonly webview: Pick<vscode.Webview, 'postMessage'>) {
        super()
    }

    public async write(msg: Message): Promise<void> {
        try {
            const ok = await this.webview.postMessage(msg)
            if (!ok) {
                throw new Error('postMessage failed')
            }
            this.errorCount = 0
        } catch (error) {
            this.fireError(error, msg, ++this.errorCount)
            return Promise.reject(error)
        }
    }

    public end(): void {}
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
type WebviewToExtHostMessageAPI = {
    /** VSCodeWrapper type */
    vscodeAPI: {
        postMessage(message: unknown): void
        onMessage(callback: (message: unknown) => void): () => void
    }
}

export function createConnectionFromWebviewToExtHost(
    { vscodeAPI }: WebviewToExtHostMessageAPI,
    api: WebviewAPI,
    options: RPCOptions
): Client<ExtHostAPI> {
    const connection = createConnectionCommon(
        new WebviewMessageReader(vscodeAPI),
        new WebviewMessageWriter(vscodeAPI),
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

class WebviewMessageReader extends AbstractMessageReader {
    constructor(private readonly vscodeAPI: WebviewToExtHostMessageAPI['vscodeAPI']) {
        super()
    }

    listen(callback: DataCallback): Disposable {
        const dispose = this.vscodeAPI.onMessage(message => {
            if (isMessage(message)) {
                callback(message)
            }
        })
        return { dispose }
    }
}

class WebviewMessageWriter extends AbstractMessageWriter {
    private errorCount = 0

    constructor(private readonly vscodeAPI: WebviewToExtHostMessageAPI['vscodeAPI']) {
        super()
    }

    public async write(msg: Message): Promise<void> {
        try {
            this.vscodeAPI.postMessage(msg)
            this.errorCount = 0
        } catch (error) {
            this.fireError(error, msg, ++this.errorCount)
            return Promise.reject(error)
        }
    }

    public end(): void {}
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
    // To enable trace logging:
    //
    // conn.trace(Trace.Verbose, { log: console.log })

    const disposables: Disposable[] = []
    for (const [method, impl] of Object.entries(api)) {
        disposables.push(conn.onRequest(method, args => impl(...args)))
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
    const cached: { [method: string]: (...args: any[]) => Promise<any> } = {}
    return new Proxy(Object.create(null), {
        get: (target, prop) => {
            if (typeof prop === 'string') {
                if (cached[prop]) {
                    return cached[prop]
                }
                const impl = (...args: any[]) => conn.sendRequest(prop, args)
                cached[prop] = impl
                return impl
            }
            return target[prop]
        },
    })
}

proxy<{ a(): Promise<number> }>(1 as any)
