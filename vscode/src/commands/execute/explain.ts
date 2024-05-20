import {
    type ContextItem,
    DefaultChatCommands,
    PromptString,
    displayLineRange,
    logDebug,
    ps,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { telemetryRecorder } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { defaultCommands } from '.'
import type { ChatCommandResult } from '../../main'
// biome-ignore lint/nursery/noRestrictedImports: Deprecated v1 telemetry used temporarily to support existing analytics.
import { telemetryService } from '../../services/telemetry'
import { getContextFileFromCurrentFile } from '../context/current-file'
import { getContextFileFromCursor } from '../context/selection'
import type { CodyCommandArgs } from '../types'
import { type ExecuteChatArguments, executeChat } from './ask'

import type { Span } from '@opentelemetry/api'
import { isUriIgnoredByContextFilterWithNotification } from '../../cody-ignore/context-filter'
import { getEditor } from '../../editor/active-editor'

/**
 * Generates the prompt and context files with arguments for the 'explain' command.
 *
 * Context: Current selection and current file
 */
async function explainCommand(
    span: Span,
    args?: Partial<CodyCommandArgs>
): Promise<ExecuteChatArguments | null> {
    const addEnhancedContext = false
    let prompt = PromptString.fromDefaultCommands(defaultCommands, 'explain')

    if (args?.additionalInstruction) {
        span.addEvent('additionalInstruction')
        prompt = ps`${prompt} ${args.additionalInstruction}`
    }

    const cs =
        (await getContextFileFromCursor(args?.range?.start))[0] ||
        (await getContextFileFromCurrentFile())[0]
    const contextFiles: ContextItem[] = [cs]

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
        command: DefaultChatCommands.Explain,
    }
}

/**
 * Executes the explain command as a chat command via 'cody.action.chat'
 */
export async function executeExplainCommand(
    args?: Partial<CodyCommandArgs>
): Promise<ChatCommandResult | undefined> {
    return wrapInActiveSpan('command.explain', async span => {
        span.setAttribute('sampled', true)
        logDebug('executeExplainCommand', 'executing', { args })

        const editor = getEditor()
        if (
            editor.active &&
            (await isUriIgnoredByContextFilterWithNotification(editor.active.document.uri, 'command'))
        ) {
            return
        }

        telemetryService.log('CodyVSCodeExtension:command:explain:executed', {
            useCodebaseContex: false,
            requestID: args?.requestID,
            source: args?.source,
            traceId: span.spanContext().traceId,
        })
        telemetryRecorder.recordEvent('cody.command.explain', 'executed', {
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

        const chatArguments = await explainCommand(span, args)

        if (chatArguments === null) {
            vscode.window.showInformationMessage(
                'Please select text before running the "Explain" command.'
            )
            return undefined
        }

        return {
            type: 'chat',
            session: await executeChat(chatArguments),
        }
    })
}
