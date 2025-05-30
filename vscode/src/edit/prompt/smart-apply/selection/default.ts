import {
    type ChatMessage,
    type CompletionParameters,
    type EditModel,
    type ModelContextWindow,
    PromptString,
    TokenCounterUtils,
    getSimplePreamble,
    psDedent,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { PromptBuilder } from '../../../../prompt-builder'
import { SMART_APPLY_REPLACE_STRATEGY } from '../../constants'
import { getSelectionFromModel } from '../selection'
import {
    LLM_PARAMETERS,
    SMART_APPLY_TOPICS,
    type SelectionPromptProviderArgs,
    type SelectionPromptProviderResult,
    type SmartApplySelectionProvider,
} from './base'

const DEFAULT_SELECTION_PROMPT = {
    system: psDedent`
        - You are an AI programming assistant who is an expert in determining the replacement selection required to apply a suggested code change to a file.
        - The suggested code change has been generated by the AI assistant. It may have been optimized for readability and brevity. Your task is just to determine the selection of code that we need to replace, we will run a subsequent prompt to apply the change using your instructions.
        - Given the suggested change, and the file where that change should be applied, you should determine the optimum replacement selection to apply this change to the file.
        - You will be provided with the contents of the file where this change should be applied, enclosed in <${SMART_APPLY_TOPICS.FILE_CONTENTS}></${SMART_APPLY_TOPICS.FILE_CONTENTS}> XML tags.
        - You will be provided with the incoming change to this file, enclosed in <${SMART_APPLY_TOPICS.INCOMING}></${SMART_APPLY_TOPICS.INCOMING}> XML tags.
        - You will be provided with an instruction that the user provided to generate the incoming change, enclosed in <${SMART_APPLY_TOPICS.INSTRUCTION}></${SMART_APPLY_TOPICS.INSTRUCTION}> XML tags.
        - Do not provide any additional commentary about the changes you made.`,
    instruction: psDedent`
        We are in the file: {filePath}

        This file contains the following code:
        <${SMART_APPLY_TOPICS.FILE_CONTENTS}>{fileContents}</${SMART_APPLY_TOPICS.FILE_CONTENTS}>

        We have the following code to apply to the file:
        <${SMART_APPLY_TOPICS.INCOMING}>{incomingText}</${SMART_APPLY_TOPICS.INCOMING}>

        We generated this code from the following instruction that the user provided:
        <${SMART_APPLY_TOPICS.INSTRUCTION}>{instruction}</${SMART_APPLY_TOPICS.INSTRUCTION}>

        Your aim is to respond with the original code that should be updated, enclosed in <${SMART_APPLY_TOPICS.REPLACE}></${SMART_APPLY_TOPICS.REPLACE}> XML tags.

        Follow these specific rules:
        - You should think step-by-step, first looking inside the <${SMART_APPLY_TOPICS.FILE_CONTENTS}></${SMART_APPLY_TOPICS.FILE_CONTENTS}> XML tags to see if there is any code that should be replaced.
        - If you find code that should be replaced, respond with the original code enclosed within <${SMART_APPLY_TOPICS.REPLACE}></${SMART_APPLY_TOPICS.REPLACE}> XML tags.
        - If you cannot find any code that should be replaced, and believe this code should be inserted into the file, respond with "<${SMART_APPLY_TOPICS.REPLACE}>${SMART_APPLY_REPLACE_STRATEGY.INSERT}</${SMART_APPLY_TOPICS.REPLACE}>"
        - If you believe that the entire contents of the file should be replaced, respond with "<${SMART_APPLY_TOPICS.REPLACE}>${SMART_APPLY_REPLACE_STRATEGY.ENTIRE_FILE}</${SMART_APPLY_TOPICS.REPLACE}>"
        - If you are unsure, respond with "<${SMART_APPLY_TOPICS.REPLACE}>${SMART_APPLY_REPLACE_STRATEGY.ENTIRE_FILE}</${SMART_APPLY_TOPICS.REPLACE}>". We will execute another prompt to apply the change correctly to this file.
    `,
}

export class DefaultSelectionProvider implements SmartApplySelectionProvider {
    public async getSelectedText({
        instruction,
        replacement,
        document,
        model,
        chatClient,
        codyApiVersion,
        contextWindow,
    }: SelectionPromptProviderArgs): Promise<string> {
        const documentRange = new vscode.Range(0, 0, document.lineCount - 1, 0)
        const documentText = PromptString.fromDocumentText(document, documentRange)
        // If the document is empty, we should insert the code without call to LLM
        // to decide what to choose as we do with the custom model that returns early
        if (!documentText.toString()) {
            return SMART_APPLY_REPLACE_STRATEGY.INSERT.toString()
        }
        const tokenCount = await TokenCounterUtils.countPromptString(documentText)

        if (tokenCount > contextWindow.input) {
            throw new Error("The amount of text in this document exceeds Cody's current capacity.")
        }

        const { prefix, messages } = await this.getPrompt(
            instruction,
            replacement,
            document,
            model,
            codyApiVersion,
            documentText,
            contextWindow
        )
        const completionParameters = this.getLLMCompletionsParameters(model, contextWindow.output)
        const selectedText = await getSelectionFromModel(
            chatClient,
            prefix,
            messages,
            completionParameters
        )
        return selectedText
    }

    private async getPrompt(
        instruction: PromptString,
        replacement: PromptString,
        document: vscode.TextDocument,
        model: EditModel,
        codyApiVersion: number,
        fileContent: PromptString,
        contextWindow: ModelContextWindow
    ): Promise<SelectionPromptProviderResult> {
        const promptBuilder = await PromptBuilder.create(contextWindow)
        const preamble = getSimplePreamble(
            model,
            codyApiVersion,
            'Default',
            DEFAULT_SELECTION_PROMPT.system
        )
        promptBuilder.tryAddToPrefix(preamble)

        const text = DEFAULT_SELECTION_PROMPT.instruction
            .replaceAll('{instruction}', instruction)
            .replaceAll('{incomingText}', replacement)
            .replaceAll('{fileContents}', fileContent)
            .replaceAll('{filePath}', PromptString.fromDisplayPath(document.uri))

        const transcript: ChatMessage[] = [{ speaker: 'human', text }]
        transcript.push({ speaker: 'assistant', text: LLM_PARAMETERS.assistantPrefix })

        promptBuilder.tryAddMessages(transcript.reverse())

        return {
            prefix: LLM_PARAMETERS.assistantPrefix.toString(),
            messages: promptBuilder.build(),
        }
    }

    private getLLMCompletionsParameters(model: EditModel, outputTokens: number): CompletionParameters {
        return {
            model,
            stopSequences: LLM_PARAMETERS.stopSequences,
            maxTokensToSample: outputTokens,
        } as CompletionParameters
    }
}
