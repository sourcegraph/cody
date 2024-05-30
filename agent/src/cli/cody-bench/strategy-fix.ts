import path from 'node:path'
import { glob } from 'glob'
import * as vscode from 'vscode'
import { fileExists } from '../../../../vscode/src/local-context/download-symf'
import { redactAuthorizationHeader } from '../../../../vscode/src/testutils/CodyPersister'
import { TestClient } from '../../TestClient'
import type { MessageHandler } from '../../jsonrpc-alias'
import { renderUnifiedDiff } from '../../renderUnifiedDiff'
import type { CodyBenchOptions } from './cody-bench'
import { evaluateEachFile } from './evaluateEachFile'
import { Llm, type LlmScore } from './llm-judge'
import { llmJudgeFixTemplate } from './llm-judge-fix-template'
import { prettyDiagnostic } from './prettyDiagnostic'
import { runVoidCommand } from './testTypecheck'

export async function evaluateFixStrategy(
    messageHandler: MessageHandler,
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
    if (!(await fileExists(path.join(options.workspace, 'node_modules')))) {
        // Run pnpm install only when `node_modules` doesn't exist.
        await runVoidCommand(options.installCommand, options.workspace)
    }

    const llm = new Llm(options)
    let totalErrors = 0
    let fixedErrors = 0
    const absoluteFiles = glob.sync(`${options.workspace}/**`, {
        ignore: ['node_modules/**'],
        nodir: true,
    })
    const scores: LlmScore[] = []
    const files = absoluteFiles.map(file => path.relative(options.workspace, file))
    let testCount = options.testCount
    await evaluateEachFile(files, options, async params => {
        if (testCount <= 0) {
            return undefined
        }
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
            const newText = client.workspace.getDocument(params.uri)?.getText() ?? ''
            const isFixed = newDiagnostics.length === 0
            const score = await llm.judge(
                llmJudgeFixTemplate({
                    codeBeforeFix: params.content,
                    codeAfterFix: newText,
                    diagnosticBeforeFix: prettyDiagnostic(diagnostic),
                    diagnosticsAfterFix: newDiagnostics.map(d => prettyDiagnostic(d)).join('\n'),
                })
            )
            console.log(`${params.file}: ${isFixed ? 'Fixed!' : 'Still errors!'}`)
            for (const newDiagnostic of newDiagnostics) {
                console.log(prettyDiagnostic(newDiagnostic))
            }
            console.log({
                name: options.fixture.name,
                ...score,
            })
            console.log(
                renderUnifiedDiff(
                    { header: `${params.uri.fsPath} (before)`, text: params.content },
                    { header: `${params.uri.fsPath} (after)`, text: newText }
                )
            )
            totalErrors += 1
            if (isFixed) {
                fixedErrors += 1
            }
            testCount -= 1
            scores.push(score)
        }
        return undefined
    })
    console.log({
        fixture: options.fixture.name,
        totalErrors,
        fixedErrors,
        totalScore: scores.reduce((a, b) => a + (b.scoreNumeric ?? 0), 0),
    })
}
