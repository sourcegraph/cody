import * as vscode from 'vscode'

import {
    BotResponseMultiplexer,
    getSimplePreamble,
    Interaction,
    Transcript,
    type CompletionParameters,
    type Message,
} from '@sourcegraph/cody-shared'

import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { FixupTask } from '../../non-stop/FixupTask'
import type { EditIntent } from '../types'

import { claude } from './claude'
import { getContext } from './context'
import type { EditLLMInteraction, GetLLMInteractionOptions, LLMInteraction } from './type'
import { truncateTextByLength } from '@sourcegraph/cody-shared/src/prompt/truncation'

// TODO: Better typing?
export type EditSupportedModels = string

const INTERACTION_MODELS: Record<EditSupportedModels, EditLLMInteraction> = {
    'anthropic/claude-2.0': claude,
    'anthropic/claude-2.1': claude,
    'anthropic/claude-instant-1.2': claude,
} as const

const getInteractionArgsFromIntent = (
    intent: EditIntent,
    model: keyof typeof INTERACTION_MODELS,
    options: GetLLMInteractionOptions
): LLMInteraction => {
    switch (intent) {
        case 'add':
            return claude.getAdd(options)
        case 'fix':
            return claude.getFix(options)
        case 'doc':
            return claude.getDoc(options)
        case 'edit':
            return claude.getEdit(options)
        case 'new':
            return claude.getNew(options)
    }
}

interface BuildInteractionOptions {
    model: EditSupportedModels
    contextWindow: number
    task: FixupTask
    editor: VSCodeEditor
}

interface BuiltInteraction extends Pick<CompletionParameters, 'stopSequences'> {
    messages: Message[]
    responseTopic: string
    responsePrefix?: string
}

export const buildInteraction = async ({
    model,
    contextWindow,
    task,
    editor,
}: BuildInteractionOptions): Promise<BuiltInteraction> => {
    const document = await vscode.workspace.openTextDocument(task.fixupFile.uri)
    const precedingText = document.getText(
        new vscode.Range(
            task.selectionRange.start.translate({
                lineDelta: -Math.min(task.selectionRange.start.line, 50),
            }),
            task.selectionRange.start
        )
    )
    const selectedText = document.getText(task.selectionRange)
    if (truncateTextByLength(selectedText, contextWindow) !== selectedText) {
        throw new Error("The amount of text selected exceeds Cody's current capacity.")
    }
    task.original = selectedText
    const followingText = document.getText(
        new vscode.Range(task.selectionRange.end, task.selectionRange.end.translate({ lineDelta: 50 }))
    )

    const { prompt, responseTopic, stopSequences, assistantText, assistantPrefix } =
        getInteractionArgsFromIntent(task.intent, model, {
            uri: task.fixupFile.uri,
            followingText,
            precedingText,
            selectedText,
            instruction: task.instruction,
        })

    const transcript = new Transcript()
    const interaction = new Interaction(
        { speaker: 'human', text: prompt, displayText: prompt },
        { speaker: 'assistant', text: assistantText, prefix: assistantPrefix },
        getContext({
            intent: task.intent,
            uri: task.fixupFile.uri,
            selectionRange: task.selectionRange,
            userContextFiles: task.userContextFiles,
            contextMessages: task.contextMessages,
            editor,
            followingText,
            precedingText,
            selectedText,
        }),
        []
    )
    transcript.addInteraction(interaction)
    const preamble = getSimplePreamble()
    const completePrompt = await transcript.getPromptForLastInteraction(preamble)

    return {
        messages: completePrompt.prompt,
        stopSequences,
        responseTopic: responseTopic || BotResponseMultiplexer.DEFAULT_TOPIC,
        responsePrefix: assistantPrefix,
    }
}
