import {
    LanguageClient,
    type LanguageClientOptions,
    type ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node'

export function startCodyLspServer(serverModule: string): LanguageClient {
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--enable-source-maps'] },
        },
    }
    const clientOptions: LanguageClientOptions = {
        documentSelector: [...supportedLanguages.values()].map(language => ({ language })),
    }
    const client = new LanguageClient('codylsp', 'Cody Language Server', serverOptions, clientOptions)
    client.start()
    return client
}
