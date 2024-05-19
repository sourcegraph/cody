export class WebViewMessageReader extends AbstractMessageReader {
    constructor(
        readonly webview: Webview,
        readonly logger: Logger | undefined
    ) {
        super()
    }

    listen(callback: DataCallback): Disposable {
        this.logger?.debug('start listening')
        return this.webview.onDidReceiveMessage(data => {
            this.logger?.debug('listen: %o', data)
            callback(data)
        })
    }
}

export class WebViewMessageWriter extends AbstractMessageWriter implements MessageWriter {
    private errorCount: number

    constructor(
        readonly webview: Webview,
        readonly logger: Logger | undefined
    ) {
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

export function createConnectionToWebview(
    webview: Webview,
    logger: Logger | undefined
): MessageConnection {
    return createMessageConnection(
        new WebViewMessageReader(webview, logger),
        new WebViewMessageWriter(webview, logger),
        logger
    )
}
