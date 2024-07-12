import path from 'node:path'
import _ from 'lodash'
import * as vscode from 'vscode'
import yaml from 'yaml'
import type { RpcMessageHandler } from '../../../../vscode/src/jsonrpc/jsonrpc'
import { fileExists } from '../../../../vscode/src/local-context/utils'
import { redactAuthorizationHeader } from '../../../../vscode/src/testutils/CodyPersister'
import { TestClient } from '../../TestClient'
import { getLanguageForFileName } from '../../language'
import type { ProtocolDiagnostic } from '../../protocol-alias'
import { EvaluationDocument } from './EvaluationDocument'
import type { CodyBenchOptions } from './command-bench'
import { evaluateEachFile } from './evaluateEachFile'
import { prettyDiagnostic } from './prettyDiagnostic'
import { runVoidCommand } from './testTypecheck'

export async function evaluateUnitTestStrategy(
    messageHandler: RpcMessageHandler,
    options: CodyBenchOptions
): Promise<void> {
    const workspace = options.absolutePath ?? options.workspace
    const metadataPath = path.join(workspace, 'test.yaml')
    if (!(await fileExists(metadataPath))) {
        console.log(`no test.yaml found in ${workspace}, skipping unit test strategy`)
        return
    }

    // The input file path may contain a line number, so we parse them accordingly
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
        const task: TestTask = yaml.parse(params.content)
        const testenv = new TestEnvUtils(workspace, task)
        if (
            (await testenv.containsFile('package.json')) &&
            !(await testenv.containsFile('node_modules'))
        ) {
            // Run npm install only when `node_modules` doesn't exist.
            await runVoidCommand(options.installCommand, workspace)
        }
        const test = await client.generateUnitTestFor(testenv.inputUri, testenv.testLineNumber)

        if (!test) {
            return
        }

        let typescriptErrors: ProtocolDiagnostic[] = []
        const isTypescript = getLanguageForFileName(test.uri.path) === 'typescript'
        if (isTypescript) {
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
        const testFilename = testenv.relative(test.uri)
        const testInputFilename = testenv.relative(testenv.inputUri)
        // check if it matches the test regex
        const matchesTestRegex = task.importRegex ? !!test.fullFile.match(task.importRegex) : false

        document.pushItem({
            range: new vscode.Range(0, 0, 0, 0),
            testFilename,
            testName: task.name,
            testLanguage: task.language,
            testInputFilename,
            testGenerated: test.value,
            testDiagnostics: _.chain(typescriptErrors)
                .uniqBy(d => d.message)
                .map(prettyDiagnostic)
                .value()
                .join('\n\n')
                .replaceAll(workspace, ''),
            resultTypechecks: typescriptErrors.length === 0,
            testExpectedFilename: task.expectedTestFilename,
            testUsedCorrectAppendOperation:
                task.shouldAppend && testFilename === task.expectedTestFilename,
            testUsedExpectedTestFramework: matchesTestRegex,
        })
        return document
    })
}

class TestEnvUtils {
    public inputUri: vscode.Uri
    public testLineNumber: number

    constructor(
        private readonly workspace: string,
        task: TestTask
    ) {
        let content = task.input
        if (!content.match(/:\d+$/)) {
            content += ':0'
        }
        const [filename, lineNumber] = content.split(':')
        this.inputUri = vscode.Uri.parse(path.join(workspace, filename))
        this.testLineNumber = Math.max(Number.parseInt(lineNumber) - 1, 0)
    }

    public async containsFile(relativePath: string): Promise<boolean> {
        const filePath = path.join(this.workspace, relativePath)
        return fileExists(filePath)
    }

    public relative(uri: string | vscode.Uri): string {
        if (uri instanceof vscode.Uri) {
            uri = uri.path
        }
        return path.relative(this.workspace, uri)
    }
}

interface TestTask {
    input: string
    name: string
    expectedTestFilename: string
    language: string
    importRegex?: string
    shouldAppend: boolean
}
