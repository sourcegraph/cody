import path from 'node:path'
import { PromptString, ps } from '@sourcegraph/cody-shared'
import { glob } from 'glob'
import * as vscode from 'vscode'
import { ProtocolTextDocumentWithUri } from '../../../../vscode/src/jsonrpc/TextDocumentWithUri'
import { pathExists } from '../../../../vscode/src/local-context/utils'
import { redactAuthorizationHeader } from '../../../../vscode/src/testutils/CodyPersister'
import { AgentTextDocument } from '../../AgentTextDocument'
import { TestClient } from '../../TestClient'
import type { RpcMessageHandler } from '../../jsonrpc-alias'
import { renderUnifiedDiff } from '../../renderUnifiedDiff'
import { vscodeRange } from '../../vscode-type-converters'
import { EvaluationDocument } from './EvaluationDocument'
import type { CodyBenchOptions } from './command-bench'
import { evaluateEachFile } from './evaluateEachFile'
import { LlmJudge, type LlmJudgeScore } from './llm-judge'
import { llmJudgeFixTemplate } from './llm-judge-fix-template'
import { prettyDiagnostic, prettyDiagnosticMessage } from './prettyDiagnostic'
import { runVoidCommand } from './testTypecheck'

export async function evaluateFixStrategy(
    messageHandler: RpcMessageHandler,
    options: CodyBenchOptions
): Promise<void> {
    const client = new TestClient(messageHandler.conn, {
        workspaceRootUri: vscode.Uri.file(options.workspace),
        name: options.fixture.name,
        credentials: {
            redactedToken: redactAuthorizationHeader(`token ${options.srcAccessToken}`),
            serverEndpoint: options.srcEndpoint,
            token: options.srcAccessToken,
        },
    })
    if (!(await pathExists(path.join(options.workspace, 'node_modules')))) {
        // Run pnpm install only when `node_modules` doesn't exist.
        await runVoidCommand(options.installCommand, options.workspace)
    }

    const llm = new LlmJudge(options)
    let totalErrors = 0
    let fixedErrors = 0
    const absoluteFiles = glob.sync(`${options.workspace}/**`, {
        ignore: ['node_modules/**'],
        nodir: true,
    })
    const scores: LlmJudgeScore[] = []
    const files = absoluteFiles.map(file => path.relative(options.workspace, file))
    let testCount = options.testCount
    await evaluateEachFile(files, options, async params => {
        if (testCount <= 0) {
            return undefined
        }
        const document = EvaluationDocument.from(params, options)
        const textDocument = new AgentTextDocument(
            ProtocolTextDocumentWithUri.from(params.uri, { content: params.content })
        )
        client.openFile(params.uri, { text: params.content })
        const { diagnostics } = await client.request('testing/diagnostics', {
            uri: params.uri.toString(),
        })
        await client.request('diagnostics/publish', { diagnostics })
        for (const diagnostic of diagnostics) {
            const { codeActions } = await client.request('codeActions/provide', {
                location: diagnostic.location,
                triggerKind: 'Invoke',
            })
            const fixAction = codeActions.find(action => action.title === 'Ask Cody to Fix')
            if (!fixAction || !fixAction.commandID) {
                console.log('No fix action found')
                console.log(prettyDiagnostic(diagnostic))
                continue
            }
            const editTask = await client.request('codeActions/trigger', { id: fixAction.id })
            await client.acceptEditTask(params.uri, editTask)
            const { diagnostics: newDiagnostics } = await client.request('testing/diagnostics', {
                uri: params.uri.toString(),
            })
            const newDocument = client.workspace.getDocument(params.uri)
            const newText = newDocument?.getText() ?? ''
            const isFixed = newDiagnostics.length === 0
            const diagnosticBeforeFix = PromptString.fromTextEditorDiagnostic(
                {
                    text: prettyDiagnostic(diagnostic),
                    message: '',
                    range: diagnostic.location.range,
                    type: 'error',
                },
                params.uri
            ).text
            const diagnosticsAfterFix = PromptString.fromTextEditorDiagnostic(
                {
                    text: newDiagnostics.map(d => prettyDiagnostic(d)).join('\n'),
                    message: '',
                    range:
                        newDiagnostics.length > 0
                            ? newDiagnostics[0].location.range
                            : new vscode.Range(0, 0, 0, 0),
                    type: 'error',
                },
                params.uri
            ).text
            const score = await llm.judge(
                llmJudgeFixTemplate({
                    codeBeforeFix: PromptString.fromDocumentText(textDocument),
                    codeAfterFix: newDocument ? PromptString.fromDocumentText(newDocument) : ps``,
                    diagnosticBeforeFix,
                    diagnosticsAfterFix,
                })
            )
            console.log(`${params.file}: ${isFixed ? 'Fixed!' : 'Still errors!'} score=${score.score}`)
            for (const newDiagnostic of newDiagnostics) {
                console.log(prettyDiagnostic(newDiagnostic))
            }
            const unifiedDiff = renderUnifiedDiff(
                { header: `${params.uri.fsPath} (before)`, text: params.content },
                { header: `${params.uri.fsPath} (after)`, text: newText }
            )
            console.log(unifiedDiff)
            totalErrors += 1
            if (isFixed) {
                fixedErrors += 1
            }
            testCount -= 1
            scores.push(score)
            document.pushItem({
                range: vscodeRange(diagnostic.location.range),

                editDiff: renderUnifiedDiff(
                    { header: '(before)', text: params.content },
                    { header: '(after)', text: newText }
                ),
                llmJudgeScore: score.scoreNumeric,
                llmJudgeReasoning: score.reasoning,
                resultTypechecks: newDiagnostics.length === 0,
                fixBeforeDiagnostic: prettyDiagnosticMessage(diagnostic),
                fixAfterDiagnostic: newDiagnostics.map(d => prettyDiagnosticMessage(d)).join('\n'),
            })
        }
        return document
    })
    console.log({
        fixture: options.fixture.name,
        totalErrors,
        fixedErrors,
        totalScore: scores.reduce((a, b) => a + (b.scoreNumeric ?? 0), 0),
    })
}
