import {
    type InitializeParams,
    ProposedFeatures,
    TextDocumentSyncKind,
    TextDocuments,
    createConnection,
} from 'vscode-languageserver/node'

import { TextDocument } from 'vscode-languageserver-textdocument'

console.log = console.error

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all)

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

connection.onInitialize((_params: InitializeParams) => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
            },
        },
    }
})

connection.onInitialized(() => {
    console.log('Initialized')
})

documents.onDidChangeContent(change => {
    console.log({ change, text: documents.get(change.document.uri)?.getText() })
})

documents.listen(connection)

connection.listen()
