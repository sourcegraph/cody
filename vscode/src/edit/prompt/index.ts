import * as vscode from 'vscode'

import {
    BotResponseMultiplexer,
    type ChatMessage,
    type EditModel,
    type EditProvider,
    ModelTag,
    PromptString,
    TokenCounterUtils,
    currentResolvedConfig,
    getSimplePreamble,
    modelsService,
    ps,
} from '@sourcegraph/cody-shared'
import type { EditIntent } from '../types'
import type { BuildInteractionOptions, BuiltInteraction, EditPromptBuilder } from './type'

import { PromptBuilder } from '../../prompt-builder'
import { getContext } from './context'
import { claude } from './models/claude'
import { openai } from './models/openai'
import type { EditLLMInteraction, GetLLMInteractionOptions, LLMInteraction } from './type'

const INTERACTION_PROVIDERS: Record<EditProvider, EditLLMInteraction> = {
    anthropic: claude,
    openai: openai,
    // NOTE: Sharing the same model for GPT models for now.
    google: openai,
} as const

const getInteractionArgsFromIntent = (
    intent: EditIntent,
    model: EditModel,
    options: GetLLMInteractionOptions
): LLMInteraction => {
    const modelInfo = modelsService.getModelByID(model)
    const isReasoningModel = modelInfo?.tags.includes(ModelTag.Reasoning)
    console.log(modelInfo)
    // Default to the generic Claude prompt if the provider is unknown
    const interaction = INTERACTION_PROVIDERS[modelInfo?.provider || ''] || claude

    switch (intent) {
        case 'add':
            return interaction.getAdd({ ...options, isReasoningModel })
        case 'fix':
            return interaction.getFix({ ...options, isReasoningModel })
        case 'doc':
            return interaction.getDoc({ ...options, isReasoningModel })
        case 'edit':
        case 'smartApply':
            return interaction.getEdit({ ...options, isReasoningModel })
        case 'test':
            return interaction.getTest({ ...options, isReasoningModel })
    }
}

export class DefaultEditPromptBuilder implements EditPromptBuilder {
    async buildInteraction({
        model,
        codyApiVersion,
        contextWindow,
        task,
        editor,
    }: BuildInteractionOptions): Promise<BuiltInteraction> {
        const document = await vscode.workspace.openTextDocument(task.fixupFile.uri)
        const prefixRange = new vscode.Range(
            task.selectionRange.start.translate({
                lineDelta: -Math.min(task.selectionRange.start.line, 50),
            }),
            task.selectionRange.start
        )
        const precedingText = PromptString.fromDocumentText(document, prefixRange)
        const selectedText = PromptString.fromDocumentText(document, task.selectionRange)
        const tokenCount = await TokenCounterUtils.countPromptString(selectedText)
        if (tokenCount > contextWindow) {
            throw new Error("The amount of text selected exceeds Cody's current capacity.")
        }
        const suffixRange = new vscode.Range(
            task.selectionRange.end,
            task.selectionRange.end.translate({ lineDelta: 50 })
        )
        const followingText = PromptString.fromDocumentText(document, suffixRange)

        const { prompt, responseTopic, stopSequences, assistantText, assistantPrefix } =
            getInteractionArgsFromIntent(task.intent, model, {
                uri: task.fixupFile.uri,
                followingText,
                precedingText,
                selectedText,
                instruction: task.instruction,
                rules: task.rules,
                document,
            })
        const promptBuilder = await PromptBuilder.create(modelsService.getContextWindowByID(model))

        const preamble = getSimplePreamble(model, codyApiVersion, 'Default', prompt.system)
        promptBuilder.tryAddToPrefix(preamble)

        // Add pre-instruction for edit commands to end of human prompt to override the default
        // prompt. This is used for providing additional information and guidelines by the user.
        const preInstruction = (await currentResolvedConfig()).configuration.editPreInstruction
        const additionalRule =
            preInstruction && preInstruction.length > 0
                ? ps`\nIMPORTANT: ${preInstruction.trim()}`
                : ps``

        const transcript: ChatMessage[] = [
            { speaker: 'human', text: prompt.instruction.concat(additionalRule) },
        ]
        if (assistantText) {
            transcript.push({ speaker: 'assistant', text: assistantText })
        }
        promptBuilder.tryAddMessages(transcript.reverse())

        const contextItems = await getContext({
            intent: task.intent,
            uri: task.fixupFile.uri,
            selectionRange: task.selectionRange,
            userContextItems: task.userContextItems,
            editor,
            suffix: { text: followingText, range: suffixRange },
            prefix: { text: precedingText, range: prefixRange },
            selectedText,
        })
        await promptBuilder.tryAddContext('user', contextItems)

        return {
            messages: promptBuilder.build(),
            stopSequences,
            responseTopic: responseTopic?.toString() || BotResponseMultiplexer.DEFAULT_TOPIC,
            responsePrefix: assistantPrefix?.toString(),
        }
    }
}
