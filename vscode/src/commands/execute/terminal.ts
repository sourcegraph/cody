import { PromptString, type TerminalOutputArguments, logDebug, ps } from '@sourcegraph/cody-shared'
import { wrapInActiveSpan } from '@sourcegraph/cody-shared'
import { telemetryRecorder } from '@sourcegraph/cody-shared'
import type { ChatCommandResult } from '../../CommandResult'
import { executeChat } from './ask'

import * as uuid from 'uuid'

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
        const source = 'terminal'
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

        const promptArgs = PromptString.fromTerminalOutputArguments(args)

        const output = promptArgs.selection?.trim()
        if (!output) {
            return undefined
        }

        let prompt = template.replaceAll('{{PROCESS}}', promptArgs.name).replaceAll('{{OUTPUT}}', output)
        const options = promptArgs.creationOptions
        if (options) {
            span.addEvent('hasCreationOptions')
            prompt = prompt.concat(ps`\nProcess options: ${options}`)
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

const template = ps`
Review and analyze this terminal output from the \`{{PROCESS}}\` process and summarize the key information. If this indicates an error, provide step-by-step instructions on how I can resolve this:
\n\`\`\`
\n{{OUTPUT}}
\n\`\`\`
`
