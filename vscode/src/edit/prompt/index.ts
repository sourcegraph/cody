import * as vscode from 'vscode'

import {
    BotResponseMultiplexer,
    getSimplePreamble,
    Interaction,
    Transcript,
    type CompletionParameters,
    type Message,
    type EditModel,
} from '@sourcegraph/cody-shared'

import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { FixupTask } from '../../non-stop/FixupTask'
import type { EditIntent } from '../types'

import { getContext } from './context'
import type { EditLLMInteraction, GetLLMInteractionOptions, LLMInteraction } from './type'
import { truncateTextByLength } from '@sourcegraph/cody-shared/src/prompt/truncation'
import { openai } from './models/openai'
import { claude } from './models/claude'

const INTERACTION_MODELS: Record<EditModel, EditLLMInteraction> = {
    'anthropic/claude-2.0': claude,
    'anthropic/claude-2.1': claude,
    'anthropic/claude-instant-1.2': claude,
    'openai/gpt-3.5-turbo': openai,
    'openai/gpt-4-1106-preview': openai,
} as const

const getInteractionArgsFromIntent = (
    intent: EditIntent,
    model: EditModel,
    options: GetLLMInteractionOptions
): LLMInteraction => {
    switch (intent) {
        case 'add':
            return INTERACTION_MODELS[model].getAdd(options)
        case 'fix':
            return INTERACTION_MODELS[model].getFix(options)
        case 'doc':
            return INTERACTION_MODELS[model].getDoc(options)
        case 'edit':
            return INTERACTION_MODELS[model].getEdit(options)
        case 'test':
            return INTERACTION_MODELS[model].getTest(options)
    }
}

interface BuildInteractionOptions {
    model: EditModel
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
