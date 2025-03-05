import {
    type CompletionParameters,
    type EditModel,
    type Message,
    type ModelContextWindow,
    PromptString,
    TokenCounterUtils,
    modelsService,
    psDedent,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getInstructionPromptWithCharLimit } from '../utils'
import {
    LLM_PARAMETERS,
    SMART_APPLY_TOPICS,
    type SelectionPromptProviderArgs,
    type SelectionPromptProviderResult,
    type SmartApplySelectionProvider,
} from './base'

export const SMART_APPLY_INSTRUCTION_TOKEN_LIMIT = 500

const DEFAULT_SELECTION_PROMPT = {
    system: psDedent`
        You are an AI programming assistant specializing in identifying which section of a file should be updated based on a proposed change. You will be provided with:
        - The user instruction used to generate the proposed change wrapped in <${SMART_APPLY_TOPICS.INSTRUCTION}></${SMART_APPLY_TOPICS.INSTRUCTION}>
        - The file contents wrapped in <${SMART_APPLY_TOPICS.FILE_CONTENTS}></${SMART_APPLY_TOPICS.FILE_CONTENTS}>
        - The proposed change wrapped in <${SMART_APPLY_TOPICS.INCOMING}></${SMART_APPLY_TOPICS.INCOMING}>.`,
    instruction: psDedent`
        We generated the following code based on the user's instruction:
        <${SMART_APPLY_TOPICS.INSTRUCTION}>{instruction}</${SMART_APPLY_TOPICS.INSTRUCTION}>

        The file (\`{filePath}\`) contains the following code:
        <${SMART_APPLY_TOPICS.FILE_CONTENTS}>{fileContents}</${SMART_APPLY_TOPICS.FILE_CONTENTS}>

        We have the following proposed change:
        <${SMART_APPLY_TOPICS.INCOMING}>{incomingText}</${SMART_APPLY_TOPICS.INCOMING}>

        Your aim is to respond with the original code from the file that should be updated, enclosed in <${SMART_APPLY_TOPICS.REPLACE}></${SMART_APPLY_TOPICS.REPLACE}> XML tags. Follow these rules:
        1. If you identify a code block to replace, respond with the original code enclosed in <${SMART_APPLY_TOPICS.REPLACE}></${SMART_APPLY_TOPICS.REPLACE}> XML tags.
        2. If no existing block is found and the change should be inserted, respond with "<${SMART_APPLY_TOPICS.REPLACE}>INSERT</${SMART_APPLY_TOPICS.REPLACE}>".
        3. If the entire file should be replaced, respond with "<${SMART_APPLY_TOPICS.REPLACE}>ENTIRE_FILE</${SMART_APPLY_TOPICS.REPLACE}>".
        4. If unsure, respond with "<${SMART_APPLY_TOPICS.REPLACE}>ENTIRE_FILE</${SMART_APPLY_TOPICS.REPLACE}>".`,
}

export class CustomModelSelectionProvider implements SmartApplySelectionProvider {
    private model: EditModel
    private contextWindow: ModelContextWindow
    private replacement: string

    constructor(model: EditModel, contextWindow: ModelContextWindow, replacement: string) {
        this.model = model
        this.contextWindow = contextWindow
        this.replacement = replacement
    }

    async getPrompt({
        instruction,
        replacement,
        document,
        model,
    }: SelectionPromptProviderArgs): Promise<SelectionPromptProviderResult> {
        const documentRange = new vscode.Range(0, 0, document.lineCount - 1, 0)
        const documentText = PromptString.fromDocumentText(document, documentRange)
        const tokenCount = await TokenCounterUtils.countPromptString(documentText)

        const contextWindow = modelsService.getContextWindowByID(model)
        if (tokenCount > contextWindow.input) {
            throw new Error("The amount of text in this document exceeds Cody's current capacity.")
        }

        const instructionPromptWithLimit = getInstructionPromptWithCharLimit(
            instruction,
            SMART_APPLY_INSTRUCTION_TOKEN_LIMIT
        )

        const systemPrompt = DEFAULT_SELECTION_PROMPT.system
        const userPrompt = DEFAULT_SELECTION_PROMPT.instruction
            .replaceAll('{instruction}', instructionPromptWithLimit)
            .replaceAll('{incomingText}', replacement)
            .replaceAll('{fileContents}', documentText)
            .replaceAll('{filePath}', PromptString.fromDisplayPath(document.uri))

        const prompt: Message[] = [
            { speaker: 'system', text: systemPrompt },
            { speaker: 'human', text: userPrompt },
        ]
        return {
            prefix: LLM_PARAMETERS.assistantPrefix.toString(),
            messages: prompt,
        }
    }

    getLLMCompletionsParameters(): CompletionParameters {
        return {
            model: this.model,
            stopSequences: LLM_PARAMETERS.stopSequences,
            maxTokensToSample: this.contextWindow.output,
            temperature: 0.1,
            stream: true,
            prediction: {
                type: 'content',
                content: this.replacement,
            },
            rewriteSpeculation: true,
            adaptiveSpeculation: true,
        } as CompletionParameters
    }
}
