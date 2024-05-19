import {
    AbstractMessageReader,
    AbstractMessageWriter,
    type DataCallback,
    type Disposable,
    type Message,
    type MessageConnection,
    type MessageReader,
    type MessageWriter,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'
import type { RPCOptions } from './transport'

/**
 * A VS Code webview's hooks for communicating with the extension host.
 */
interface RawWebviewMessageAPI {
    globalThis: {
        acquireVsCodeApi: () => { postMessage: (message: unknown) => void }
        addEventListener: (event: 'message', listener: (event: MessageEvent<unknown>) => void) => void
        removeEventListener: (event: 'message', listener: (event: MessageEvent<unknown>) => void) => void
    }
}

export function createConnectionFromWebviewToExtHost(
    api: RawWebviewMessageAPI,
    options?: RPCOptions
): MessageConnection {
    return createMessageConnection(new WebViewMessageReader(api), new WebViewMessageWriter(api))
}

function isMessage(value: unknown): value is Message {
    return typeof value === 'object' && 'jsonrpc' in value
}

class WebViewMessageReader extends AbstractMessageReader implements MessageReader {
    constructor(private readonly api: RawWebviewMessageAPI) {
        super()
    }

    listen(callback: DataCallback): Disposable {
        function handler(event: MessageEvent<unknown>): void {
            try {
                const data = event.data
                if (isMessage(data)) {
                    callback(data)
                }
            } catch (error) {
                this.fireError(error)
            }
        }
        this.api.globalThis.addEventListener('message', handler)
        return {
            dispose: () => {
                this.api.globalThis.removeEventListener('message', handler)
            },
        }
    }
}

class WebViewMessageWriter extends AbstractMessageWriter implements MessageWriter {
    private errorCount: number

    constructor(private readonly api: RawWebviewMessageAPI) {
        super()
        this.errorCount = 0
    }

    public async write(msg: Message): Promise<void> {
        try {
            await this.api.postMessage(msg)
            this.errorCount = 0
        } catch (error) {
            this.handleError(error, msg)
            return Promise.reject(error)
        }
    }

    private handleError(error: any, msg: Message): void {
        this.errorCount++
        this.fireError(error, msg, this.errorCount)
    }

    public end(): void {
        /* empty */
    }
}

function createConnectionToVSCode(api: VSCodeMessageAPI, logger: Logger | undefined): MessageConnection {
    return createMessageConnection(
        new WebViewMessageReader(api, logger),
        new WebViewMessageWriter(api, logger),
        logger
    )
}
