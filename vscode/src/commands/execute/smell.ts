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
import { getContextFileFromCursor } from '../context/selection'
import type { CodyCommandArgs } from '../types'
import { type ExecuteChatArguments, executeChat } from './ask'

import type { Span } from '@opentelemetry/api'
import { isUriIgnoredByContextFilterWithNotification } from '../../cody-ignore/context-filter'
import { getEditor } from '../../editor/active-editor'
import { getContextFileFromCurrentFile } from '../context/current-file'

/**
 * Generates the prompt and context files with arguments for the 'smell' command.
 *
 * Context: Current selection
 */
async function smellCommand(
    span: Span,
    args?: Partial<CodyCommandArgs>
): Promise<ExecuteChatArguments | null> {
    let prompt = PromptString.fromDefaultCommands(defaultCommands, 'smell')

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
        if (
            editor.active &&
            (await isUriIgnoredByContextFilterWithNotification(editor.active.document.uri, 'command'))
        ) {
            return
        }

        logDebug('executeSmellCommand', 'executing', { args })
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
                'Please select text before running the "Smell" command.'
            )
            return
        }

        return {
            type: 'chat',
            session: await executeChat(chatArguments),
        }
    })
}
