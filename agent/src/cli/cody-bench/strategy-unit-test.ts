import {MessageHandler} from "../../../../vscode/src/jsonrpc/jsonrpc";
import { CodyBenchOptions } from "./cody-bench";
import { TestClient } from "../../TestClient";
import { redactAuthorizationHeader } from "../../../../vscode/src/testutils/CodyPersister";
import { fileExists } from "../../../../vscode/src/local-context/download-symf";
import * as vscode from "vscode";
import path from "node:path";
import {glob} from "glob";
import {evaluateEachFile} from "./evaluateEachFile";
import {EvaluationDocument} from "./EvaluationDocument";
import {runVoidCommand} from "./testTypecheck";

export async function evaluateUnitTestStrategy(
    messageHandler: MessageHandler,
    options: CodyBenchOptions
): Promise<void> {
    console.log("running unit test strategy")

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

    let totalErrors = 0
    let fixedErrors = 0
    const absoluteFiles = glob.sync(`${options.workspace}/**`, {
        ignore: ['node_modules/**'],
        nodir: true,
    })

    const files = absoluteFiles.map(file => path.relative(options.workspace, file))
    await evaluateEachFile(files, options, async params => {
        const document = EvaluationDocument.from(params, options)
        await client.openFile(params.uri, {text: params.content})

        const id = await client.request('editCommands/test', null)
        const applyError = await client.taskHasReachedAppliedPhase(id).catch(error => error);
        const untitledDocuments = client.workspace
            .allUris()
            .filter(uri => vscode.Uri.parse(uri).scheme === 'untitled')
        const untitledDocument = untitledDocuments.find(d => d !== params.uri.toString())
        const testDocument = client.workspace.getDocument(vscode.Uri.parse(untitledDocument ?? ''))
        const range = new vscode.Range(0, 0, 0, 0)

        document.pushItem({range, resultError: applyError, resultEmpty: !testDocument?.getText(), chatReply: "testing!"})
        return document
    })

    console.log({
        fixture: options.fixture.name,
        totalErrors,
        fixedErrors,
        totalScore: 0,
    })
}
