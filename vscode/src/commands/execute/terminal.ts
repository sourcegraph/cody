import { DefaultChatCommands, logDebug } from '@sourcegraph/cody-shared'
import type { ChatCommandResult } from '../../main'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { executeChat } from './ask'

import * as uuid from 'uuid'

import { wrapInActiveSpan } from '@sourcegraph/cody-shared/src/tracing'

interface TerminalOutputArguments {
    name: string
    selection?: string
    creationOptions?: { shellPath?: string; shellArgs?: string[] }
}

/**
 * Executes a chat command to explain the given terminal output.
 * Can be invoked from the VS Code terminal.
 *
 * NOTE: The terminal output arguments is returned by the user's
 * selection through context menu (right click).
 */
export async function executeExplainOutput(
    args: TerminalOutputArguments
): Promise<ChatCommandResult | undefined> {
    return wrapInActiveSpan('command.terminal', async span => {
        span.setAttribute('sampled', true)
        logDebug('executeExplainOutput', 'executing', { args })
        const requestID = uuid.v4()
        const addEnhancedContext = false
        const source = DefaultChatCommands.Terminal
        telemetryService.log('CodyVSCodeExtension:command:terminal:executed', {
            useCodebaseContex: false,
            requestID,
            source,
            traceId: span.spanContext().traceId,
        })
        telemetryRecorder.recordEvent('cody.command.terminal', 'executed', {
            metadata: {
                useCodebaseContex: 0,
            },
            interactionID: requestID,
            privateMetadata: {
                requestID,
                source,
                traceId: span.spanContext().traceId,
            },
        })

        const output = args.selection?.trim()
        if (!output) {
            return undefined
        }

        let prompt = template.replace('{{PROCESS}}', args.name).replace('{{OUTPUT}}', output)
        const options = JSON.stringify(args.creationOptions ?? {})
        if (options) {
            span.addEvent('hasCreationOptions')
            prompt += `\nProcess options: ${options}`
        }

        return {
            type: 'chat',
            session: await executeChat({
                text: prompt,
                submitType: 'user-newchat',
                contextFiles: [],
                addEnhancedContext,
                source,
            }),
        }
    })
}

const template = `
Review and analyze this terminal output from the \`{{PROCESS}}\` process and summarize the key information. If this indicates an error, provide step-by-step instructions on how I can resolve this:
\n\`\`\`
\n{{OUTPUT}}
\n\`\`\`
`
