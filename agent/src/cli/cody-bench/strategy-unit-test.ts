import path from 'node:path'
import * as vscode from 'vscode'
import yaml from 'yaml'
import type { MessageHandler } from '../../../../vscode/src/jsonrpc/jsonrpc'
import { fileExists } from '../../../../vscode/src/local-context/download-symf'
import { redactAuthorizationHeader } from '../../../../vscode/src/testutils/CodyPersister'
import { TestClient } from '../../TestClient'
import { getLanguageForFileName } from '../../language'
import type { ProtocolDiagnostic, TextDocumentEditParams } from '../../protocol-alias'
import { EvaluationDocument } from './EvaluationDocument'
import type { CodyBenchOptions } from './cody-bench'
import { evaluateEachFile } from './evaluateEachFile'
import { prettyDiagnostic } from './prettyDiagnostic'
import { runVoidCommand } from './testTypecheck'

export async function evaluateUnitTestStrategy(
    messageHandler: MessageHandler,
    options: CodyBenchOptions
): Promise<void> {
    const workspace = options.absolutePath ?? options.workspace
    const metadataPath = path.join(workspace, 'test.yaml')
    if (!(await fileExists(metadataPath))) {
        console.log(`no test.yaml found in ${workspace}, skipping unit test strategy`)
        return
    }

    const parseInputUri = (content: string): [vscode.Uri, number] => {
        if (!content.match(/:\d+$/)) {
            content += ':0'
        }
        const [filename, lineNumber] = content.split(':')
        return [
            vscode.Uri.parse(path.join(workspace, filename)),
            Math.max(Number.parseInt(lineNumber) - 1, 0),
        ]
    }

    const client = new TestClient(messageHandler.conn, {
        workspaceRootUri: vscode.Uri.file(workspace),
        name: options.fixture.name,
        credentials: {
            redactedToken: redactAuthorizationHeader(`token ${options.srcAccessToken}`),
            serverEndpoint: options.srcEndpoint,
            token: options.srcAccessToken,
        },
    })

    await evaluateEachFile([path.relative(workspace, metadataPath)], options, async params => {
        console.log(`evaluating ${params.uri.fsPath}`)
        const task: TestTask = yaml.parse(params.content)
        if (
            (await fileExists(path.join(workspace, 'package.json'))) &&
            !(await fileExists(path.join(workspace, 'node_modules')))
        ) {
            // Run npm install only when `node_modules` doesn't exist.
            await runVoidCommand(options.installCommand, workspace)
        }
        const [inputUri, line] = parseInputUri(task.input)
        const editParams = await client.generateUnitTestFor(inputUri, line)

        const test = getTestValue(editParams)
        if (!test) {
            return
        }

        let typescriptErrors: ProtocolDiagnostic[] = []
        if (test && getLanguageForFileName(test.uri.path) === 'typescript') {
            // Open the test file so that the typescript server can typecheck it
            // without this we get empty diagnostics
            client.notify('textDocument/didOpen', {
                uri: test.uri.toString(),
                content: test.value,
            })

            const { diagnostics } = await client.request('testing/diagnostics', {
                uri: test.uri.toString(),
            })
            typescriptErrors = diagnostics
        }
        const document = EvaluationDocument.from(params, options)

        // normalized test files
        const testFile = path.relative(workspace, test.uri.path)
        const testInputFile = path.relative(workspace, inputUri.path)
        // check if it matches the test regex
        const matchesTestRegex = task.importRegex ? !!test.value.match(task.importRegex) : false

        document.pushItem({
            range: new vscode.Range(0, 0, 0, 0),
            testFile,
            testName: task.name,
            testLanguage: task.language,
            testInputFile,
            testGenerated: test.value,
            testHasTypescriptErrors: typescriptErrors.length > 0,
            testDiagnostics: typescriptErrors.map(prettyDiagnostic).join('\n').replaceAll(workspace, ''),
            testExpectedFile: task.expectedTestFilename,
            testMatchesExpectedTestFile: testFile === task.expectedTestFilename,
            testUsedExpectedTestFramework: matchesTestRegex,
        })
        return document
    })
}

function getTestValue(editParams: TextDocumentEditParams | undefined): TestInfo | undefined {
    if (!editParams || editParams.edits.length !== 1) {
        throw new Error('Expected a single edit')
    }
    const edit = editParams.edits[0]
    switch (edit.type) {
        case 'insert':
        case 'replace':
            return { uri: vscode.Uri.parse(editParams.uri).with({ scheme: 'file' }), value: edit.value }
        default:
            return undefined
    }
}

interface TestInfo {
    uri: vscode.Uri
    value: string
}

interface TestTask {
    input: string
    name: string
    expectedTestFilename: string
    language: string
    importRegex?: string
}
