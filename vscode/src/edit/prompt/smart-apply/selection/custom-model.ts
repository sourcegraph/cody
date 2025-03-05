import {
    type CompletionParameters,
    type EditModel,
    type Message,
    PromptString,
    TokenCounterUtils,
    psDedent,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getSelectionFromModel } from '../selection'
import { getInstructionPromptWithCharLimit } from '../utils'
import {
    LLM_PARAMETERS,
    SMART_APPLY_TOPICS,
    type SelectionPromptProviderArgs,
    type SelectionPromptProviderResult,
    type SmartApplySelectionProvider,
} from './base'

const SMART_APPLY_INSTRUCTION_TOKEN_LIMIT = 500
const FULL_FILE_REWRITE_TOKEN_TOKEN_LIMIT = 12000

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
    public async getSelectedText({
        instruction,
        replacement,
        document,
        model,
        chatClient,
        contextWindow,
    }: SelectionPromptProviderArgs): Promise<string> {
        const documentRange = new vscode.Range(0, 0, document.lineCount - 1, 0)
        const documentText = PromptString.fromDocumentText(document, documentRange)
        const tokenCount = await TokenCounterUtils.countPromptString(documentText)

        if (tokenCount > contextWindow.input) {
            throw new Error("The amount of text in this document exceeds Cody's current capacity.")
        }
        if (tokenCount < FULL_FILE_REWRITE_TOKEN_TOKEN_LIMIT) {
            return 'ENTIRE_FILE'
        }
        const { prefix, messages } = await this.getPrompt(
            instruction,
            replacement,
            document,
            documentText
        )
        const completionParameters = this.getLLMCompletionsParameters(
            model,
            contextWindow.output,
            replacement.toString()
        )
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
        fileContent: PromptString
    ): Promise<SelectionPromptProviderResult> {
        const instructionPromptWithLimit = getInstructionPromptWithCharLimit(
            instruction,
            SMART_APPLY_INSTRUCTION_TOKEN_LIMIT
        )

        const systemPrompt = DEFAULT_SELECTION_PROMPT.system
        const userPrompt = DEFAULT_SELECTION_PROMPT.instruction
            .replaceAll('{instruction}', instructionPromptWithLimit)
            .replaceAll('{incomingText}', replacement)
            .replaceAll('{fileContents}', fileContent)
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

    getLLMCompletionsParameters(
        model: EditModel,
        outputTokens: number,
        replacement: string
    ): CompletionParameters {
        return {
            model,
            stopSequences: LLM_PARAMETERS.stopSequences,
            maxTokensToSample: outputTokens,
            temperature: 0.1,
            stream: true,
            prediction: {
                type: 'content',
                content: replacement,
            },
            rewriteSpeculation: true,
            adaptiveSpeculation: true,
        } as CompletionParameters
    }
}
