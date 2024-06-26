import path from 'node:path'
import { glob } from 'glob'
import * as vscode from 'vscode'
import yaml from 'yaml'
import type { MessageHandler } from '../../../../vscode/src/jsonrpc/jsonrpc'
import { fileExists } from '../../../../vscode/src/local-context/download-symf'
import { redactAuthorizationHeader } from '../../../../vscode/src/testutils/CodyPersister'
import { TestClient } from '../../TestClient'
import { getLanguageForFileName } from '../../language'
import type { TextDocumentEditParams } from '../../protocol-alias'
import { EvaluationDocument } from './EvaluationDocument'
import type { CodyBenchOptions } from './cody-bench'
import { evaluateEachFile } from './evaluateEachFile'
import { runVoidCommand } from './testTypecheck'

export async function evaluateUnitTestStrategy(
    messageHandler: MessageHandler,
    options: CodyBenchOptions
): Promise<void> {
    console.log('running unit test strategy')

    const client = new TestClient(messageHandler.conn, {
        workspaceRootUri: vscode.Uri.file(options.workspace),
        name: options.fixture.name,
        credentials: {
            redactedToken: redactAuthorizationHeader(`token ${options.srcAccessToken}`),
            serverEndpoint: options.srcEndpoint,
            token: options.srcAccessToken,
        },
    })
    if (!(await fileExists(path.join(options.workspace, 'node_modules')))) {
        // Run pnpm install only when `node_modules` doesn't exist.
        await runVoidCommand(options.installCommand, options.workspace)
    }

    const absoluteFiles = glob.sync(`${options.workspace}/**`, {
        ignore: ['node_modules/**'],
        nodir: true,
    })

    const files = absoluteFiles.map(file => path.relative(options.workspace, file))
    const yamlFiles = files.filter(file => file.endsWith('.yaml'))
    await evaluateEachFile(yamlFiles, options, async params => {
        const task: TestTask = yaml.parse(params.content)
        const document = EvaluationDocument.from(params, options)
        const editParams = await client.generateUnitTestFor(vscode.Uri.parse(task.input))

        const test = getTestValue(editParams)
        const range = new vscode.Range(0, 0, 0, 0)
        if (test && getLanguageForFileName(params.uri.fsPath) === 'typescript') {
            const diagnostics = await client.request('testing/diagnostics', {
                uri: params.uri.toString(),
            })
            diagnostics
        }
        document.pushItem({
            range,
            resultEmpty: test?.value === '',
            resultText: test?.value,
            multiline: true,
        })
        return document
    })

    console.log({
        fixture: options.fixture.name,
        totalScore: 0,
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
            return { file: editParams.uri, value: edit.value }
        default:
            return undefined
    }
}

interface TestInfo {
    file: string
    value: string
}

interface TestTask {
    input: string
    context?: string[]
    expectedTestFile: string
}
