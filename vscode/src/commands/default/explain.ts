import { logDebug, type ContextFile } from '@sourcegraph/cody-shared'
import { getContextFileFromCursor } from '../context/selection'
import { getContextFileFromCurrentFile } from '../context/current-file'
import { type ExecuteChatArguments, executeChat } from './ask'
import { DefaultChatCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { defaultCommands } from '.'
import type { ChatCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'

/**
 * Generates the prompt and context files with arguments for the 'explain' command.
 *
 * Context: Current selection and current file
 */
export async function explainCommand(args?: Partial<CodyCommandArgs>): Promise<ExecuteChatArguments> {
    const addEnhancedContext = false
    let prompt = defaultCommands.explain.prompt

    if (args?.additionalInstruction) {
        prompt = `${prompt} ${args.additionalInstruction}`
    }

    // fetches the context file from the current cursor position using getContextFileFromCursor().
    const contextFiles: ContextFile[] = []

    const currentSelection = await getContextFileFromCursor()
    contextFiles.push(...currentSelection)

    const currentFile = await getContextFileFromCurrentFile()
    contextFiles.push(...currentFile)

    return {
        text: prompt,
        submitType: 'user-newchat',
        contextFiles,
        addEnhancedContext,
        source: DefaultChatCommands.Explain,
    }
}

/**
 * Executes the explain command as a chat command via 'cody.action.chat'
 */
export async function executeExplainCommand(
    args?: Partial<CodyCommandArgs>
): Promise<ChatCommandResult | undefined> {
    logDebug('executeExplainCommand', 'executing', { args })
    telemetryService.log('CodyVSCodeExtension:command:explain:executed', {
        useCodebaseContex: false,
        requestID: args?.requestID,
        source: args?.source,
    })
    telemetryRecorder.recordEvent('cody.command.explain', 'executed', {
        metadata: {
            useCodebaseContex: 0,
        },
        interactionID: args?.requestID,
        privateMetadata: {
            requestID: args?.requestID,
            source: args?.source,
        },
    })

    return {
        type: 'chat',
        session: await executeChat(await explainCommand(args)),
    }
}
