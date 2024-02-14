import { logDebug, type ContextFile } from '@sourcegraph/cody-shared'
import { getContextFileFromCursor } from '../context/selection'
import { type ExecuteChatArguments, executeChat } from './ask'
import { DefaultChatCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { defaultCommands } from '.'
import type { ChatCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'

import { tracer } from '@sourcegraph/cody-shared/src/tracing'
import type { Span } from '@opentelemetry/api'

/**
 * Generates the prompt and context files with arguments for the 'smell' command.
 *
 * Context: Current selection
 */
export async function smellCommand(
    span: Span,
    args?: Partial<CodyCommandArgs>
): Promise<ExecuteChatArguments> {
    const addEnhancedContext = false
    let prompt = defaultCommands.smell.prompt

    if (args?.additionalInstruction) {
        span.addEvent('additionalInstruction')
        prompt = `${prompt} ${args.additionalInstruction}`
    }

    const contextFiles: ContextFile[] = []

    span.addEvent('getContextFileFromCursor')
    const currentSelection = await getContextFileFromCursor()
    contextFiles.push(...currentSelection)

    return {
        text: prompt,
        submitType: 'user-newchat',
        contextFiles,
        addEnhancedContext,
        source: DefaultChatCommands.Smell,
    }
}

/**
 * Executes the smell command as a chat command via 'cody.action.chat'
 */
export async function executeSmellCommand(
    args?: Partial<CodyCommandArgs>
): Promise<ChatCommandResult | undefined> {
    return tracer.startActiveSpan(
        'command.smell',
        async (span): Promise<ChatCommandResult | undefined> => {
            span.setAttribute('sampled', true)
            logDebug('executeSmellCommand', 'executing', { args })
            telemetryService.log('CodyVSCodeExtension:command:smell:executed', {
                useCodebaseContex: false,
                requestID: args?.requestID,
                source: args?.source,
                traceId: span.spanContext().traceId,
            })
            telemetryRecorder.recordEvent('cody.command.smell', 'executed', {
                metadata: {
                    useCodebaseContex: 0,
                },
                interactionID: args?.requestID,
                privateMetadata: {
                    requestID: args?.requestID,
                    source: args?.source,
                    traceId: span.spanContext().traceId,
                },
            })

            return {
                type: 'chat',
                session: await executeChat(await smellCommand(span, args)),
            }
        }
    )
}
