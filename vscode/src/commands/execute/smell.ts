import {
    type ContextItem,
    DefaultChatCommands,
    PromptString,
    contextFiltersProvider,
    displayLineRange,
    logDebug,
    ps,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { defaultCommands } from '.'
import type { ChatCommandResult } from '../../main'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { getContextFileFromCursor } from '../context/selection'
import type { CodyCommandArgs } from '../types'
import { type ExecuteChatArguments, executeChat } from './ask'

import type { Span } from '@opentelemetry/api'
import { activeNotification } from '../../context-filters/notification'
import { getEditor } from '../../editor/active-editor'

/**
 * Generates the prompt and context files with arguments for the 'smell' command.
 *
 * Context: Current selection
 */
async function smellCommand(
    span: Span,
    args?: Partial<CodyCommandArgs>
): Promise<ExecuteChatArguments | null> {
    const addEnhancedContext = false
    let prompt = PromptString.fromDefaultCommands(defaultCommands, 'smell')

    if (args?.additionalInstruction) {
        span.addEvent('additionalInstruction')
        prompt = ps`${prompt} ${args.additionalInstruction}`
    }

    const contextFiles: ContextItem[] = []

    const currentSelection = await getContextFileFromCursor()
    contextFiles.push(...currentSelection)

    const cs = currentSelection[0]
    if (cs) {
        const range = cs.range && ps`:${displayLineRange(cs.range)}`
        prompt = prompt.replaceAll(
            'the selected code',
            ps`@${PromptString.fromDisplayPath(cs.uri)}${range ?? ''} `
        )
    } else {
        return null
    }

    return {
        text: prompt,
        submitType: 'user-newchat',
        contextFiles,
        addEnhancedContext,
        source: args?.source,
        command: DefaultChatCommands.Smell,
    }
}

/**
 * Executes the smell command as a chat command via 'cody.action.chat'
 */
export async function executeSmellCommand(
    args?: Partial<CodyCommandArgs>
): Promise<ChatCommandResult | undefined> {
    return wrapInActiveSpan('command.smell', async span => {
        span.setAttribute('sampled', true)

        const editor = getEditor()
        if (editor.active && (await contextFiltersProvider.isUriIgnored(editor.active.document.uri))) {
            activeNotification(editor.active.document.uri, 'context-filter')
            return
        }

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

        const chatArguments = await smellCommand(span, args)
        if (chatArguments === null) {
            vscode.window.showInformationMessage(
                'Please select text before running the "Explain" command.'
            )
            return
        }

        return {
            type: 'chat',
            session: await executeChat(chatArguments),
        }
    })
}
