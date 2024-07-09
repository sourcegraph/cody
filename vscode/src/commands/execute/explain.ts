import {
    type ContextItem,
    DefaultChatCommands,
    PromptString,
    isDefined,
    logDebug,
    ps,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { telemetryRecorder } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { defaultCommands, selectedCodePromptWithExtraFiles } from '.'
import type { ChatCommandResult } from '../../CommandResult'
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
export async function explainCommand(
    span: Span,
    args?: Partial<CodyCommandArgs>
): Promise<ExecuteChatArguments | null> {
    let prompt = PromptString.fromDefaultCommands(defaultCommands, 'explain')

    if (args?.additionalInstruction) {
        span.addEvent('additionalInstruction')
        prompt = ps`${prompt} ${args.additionalInstruction}`
    }

    const currentSelection = await getContextFileFromCursor(args?.range?.start)
    const currentFile = await getContextFileFromCurrentFile()
    const contextItems: ContextItem[] = [currentSelection, currentFile].filter(isDefined)
    if (contextItems.length === 0) {
        return null
    }

    prompt = prompt.replaceAll(
        'the selected code',
        selectedCodePromptWithExtraFiles(contextItems[0], contextItems.slice(1))
    )

    return {
        text: prompt,
        submitType: 'user-newchat',
        contextFiles: contextItems,
        addEnhancedContext: false,
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
