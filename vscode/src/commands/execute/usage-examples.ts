import { PromptString, logDebug, ps, wrapInActiveSpan } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getEditor } from '../../editor/active-editor'
import type { ChatCommandResult } from '../../main'
import { telemetryRecorder } from '../../services/telemetry-v2'
import type { CodyCommandArgs } from '../types'
import { executeChat } from './ask'

/**
 * The command that generates a new docstring for the selected code.
 * When called, the command will be executed as an inline-edit command.
 */
export async function executeUsageExamplesCommand(
    args?: Partial<CodyCommandArgs>
): Promise<ChatCommandResult | undefined> {
    return wrapInActiveSpan('command.usageExamples', async span => {
        span.setAttribute('sampled', true)
        logDebug('executeDocCommand', 'executing', { args })
        telemetryRecorder.recordEvent('cody.command.usageExamples', 'executed', {
            interactionID: args?.requestID,
            privateMetadata: {
                requestID: args?.requestID,
                source: args?.source,
                traceId: span.spanContext().traceId,
            },
        })

        const activeEditor = getEditor().active
        const doc = activeEditor?.document
        if (!doc) {
            return undefined
        }
        const symbolRange = doc.getWordRangeAtPosition((args?.range ?? activeEditor.selection).start)
        if (!symbolRange) {
            return undefined
        }

        let prompt = ps`Show usage examples for \`${PromptString.fromDocumentText(doc, symbolRange)}\``

        const symbolPackage = await guessSymbolPackage(doc, symbolRange)
        if (symbolPackage) {
            prompt = ps`${prompt} from @${PromptString.unsafe_fromUserQuery(
                `${symbolPackage.ecosystem}:${symbolPackage.name}`
            )}`
        }

        return {
            type: 'chat',
            session: await executeChat({
                text: prompt,
                submitType: 'user-newchat',
                addEnhancedContext: false,
                source: args?.source,
            }),
        }
    })
}

async function guessSymbolPackage(
    doc: vscode.TextDocument,
    symbolRange: vscode.Range
): Promise<{ ecosystem: string; name: string } | null> {
    const defs: (vscode.Location | vscode.LocationLink)[] = await vscode.commands.executeCommand(
        'vscode.executeDefinitionProvider',
        doc.uri,
        symbolRange.start
    )

    // TODO(sqs): hacky and only supports npm.
    for (const def of defs) {
        const targetUri = def instanceof vscode.Location ? def.uri : def.targetUri
        const npmPackage = targetUri.path
            .match(/.*\/node_modules\/((?:[^@/]+)|(?:@[^/]+\/[^/]+))\//)?.[1]
            .replace(/^@types\//, '')
        if (npmPackage) {
            return { ecosystem: 'npm', name: npmPackage }
        }
    }

    return null
}
