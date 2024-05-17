import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import * as rpc from 'vscode-jsonrpc/node'
import * as lsp from 'vscode-languageserver-protocol/node'

import ts from 'typescript'
import { Uri } from '../../../../testutils/uri'

export function startLanguageServer(): rpc.MessageConnection {
    const serverProcess = spawn('node', [
        require.resolve('typescript-language-server/lib/cli.mjs'),
        '--stdio',
    ])

    const connection = rpc.createMessageConnection(
        new rpc.StreamMessageReader(serverProcess.stdout),
        new rpc.StreamMessageWriter(serverProcess.stdin)
    )

    connection.listen()

    return connection
}

export async function didOpenTextDocument(connection: rpc.MessageConnection, uri: Uri) {
    const textDocument = {
        uri: uri.fsPath,
        languageId: 'typescript',
        version: 1,
        text: fs.readFileSync(uri.fsPath, 'utf8'),
    }

    connection.sendNotification(lsp.DidOpenTextDocumentNotification.type, {
        textDocument: textDocument,
    })
}

// TODO: parameterize
const TEST_DATA_PATH = path.join(__dirname, 'test-data')
const TEST_DATA_URI = Uri.file(TEST_DATA_PATH)
const TS_CONFIG_PATH = path.join(TEST_DATA_PATH, 'tsconfig.json')

export function getFilesFromTsConfig(tsConfigPath: string): string[] {
    const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile)

    if (configFile.error) {
        throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
    }

    const configParseResult = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsConfigPath)
    )

    if (configParseResult.errors.length > 0) {
        throw new Error(ts.flattenDiagnosticMessageText(configParseResult.errors[0].messageText, '\n'))
    }

    return configParseResult.fileNames
}

export async function initialize(connection: rpc.MessageConnection): Promise<lsp.InitializeResult> {
    const initializeParams = {
        processId: process.pid,
        rootUri: TEST_DATA_URI.toString(),
        // TODO: figure out what client capabilities are required to mirror the default Typescript experience in VS Code.
        // TODO: test with without capabilities
        capabilities: {
            textDocument: {
                definition: {
                    // Relevant source in the language server:
                    // https://github.com/typescript-language-server/typescript-language-server/blob/b224b878652438bcdd639137a6b1d1a6630129e4/src/lsp-server.ts#L394
                    //
                    // Implementation in the typescript-language-features extension:
                    // https://github.com/microsoft/vscode/blob/a48f464a3e01aad384703ec964018299b14bb7cf/extensions/typescript-language-features/src/languageFeatures/definitions.ts#L27
                    linkSupport: true,
                },
            },
        },
        workspaceFolders: [
            {
                uri: TEST_DATA_URI.toString(),
                name: 'workspace',
            },
        ],
    } satisfies lsp.InitializeParams

    const response = await connection.sendRequest(lsp.InitializeRequest.type, initializeParams)
    return response
}

export async function openWorkspaceFiles(connection: rpc.MessageConnection): Promise<Uri[]> {
    const workspaceFiles = getFilesFromTsConfig(TS_CONFIG_PATH)
    const workspaceFileURIs = workspaceFiles.map(filePath => Uri.file(filePath))
    await Promise.all(workspaceFileURIs.map(fileUri => didOpenTextDocument(connection, fileUri)))

    return workspaceFileURIs
}
