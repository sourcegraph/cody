import {
    type Event,
    type Event,
    type MessageReader,
    type MessageWriter,ageConnection,
} from 'vscode-jsonrpc'
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-jsonrpc/browser'

export interface RPCOptions {
    hydrate?<T, U>(value: T, hydrateUri: (value: unknown) => U): T
    verbose?: boolean
}

export interface RPCTransportPair {
    reader: MessageReader
    writer: MessageWriter
}

/**
 * The VS Code extension host uses this to communicate with a webview.
 */
interface ExtHostToWebviewTransport {
    onDidReceiveMessage: Event<unknown>
    postMessage(message: unknown): Promise<boolean>
}

export function proxyExtHostMethodInWebview<M extends (...args:any[])=>Promise<any>)>(transport: WebviewToExtHostTransport, method:string): M {
    createMessageConnection(new BrowserMessageReader(self), new BrowserMessageWriter(self))
}
}
