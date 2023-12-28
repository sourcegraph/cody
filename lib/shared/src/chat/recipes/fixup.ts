import { ContextMessage, getContextMessageWithResponse } from '../../codebase-context/messages'
import { FixupIntent, VsCodeFixupTaskRecipeData } from '../../editor'
import { MAX_CURRENT_FILE_TOKENS, MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import {
    populateCodeContextTemplate,
    populateCodeGenerationContextTemplate,
    populateCurrentEditorDiagnosticsTemplate,
} from '../../prompt/templates'
import { truncateText, truncateTextStart } from '../../prompt/truncation'
import { newInteraction } from '../prompts/utils'
import { Interaction } from '../transcript/interaction'

import { getContextMessagesFromSelection } from './helpers'
import { Recipe, RecipeContext, RecipeID, RecipeType } from './recipe'

export const PROMPT_TOPICS = {
    OUTPUT: 'CODE5711',
    SELECTED: 'SELECTEDCODE7662',
    PRECEDING: 'PRECEDINGCODE3493',
    FOLLOWING: 'FOLLOWINGCODE2472',
    INSTRUCTIONS: 'INSTRUCTIONS7390',
    DIAGNOSTICS: 'DIAGNOSTICS5668',
}

export class Fixup implements Recipe {
    public id: RecipeID = 'fixup'
    public title = 'Fixup'
    public multiplexerTopic = PROMPT_TOPICS.OUTPUT
    public type = RecipeType.Edit
    public stopSequences = [`</${PROMPT_TOPICS.OUTPUT}>`]

    public async getInteraction(taskId: string, context: RecipeContext): Promise<Interaction | null> {
        const fixupController = context.editor.controllers?.fixups
        if (!fixupController) {
            return null
        }

        const fixupTask = await fixupController.getTaskRecipeData(taskId)

        if (!fixupTask) {
            return null
        }

        const promptText = this.getPrompt(fixupTask)
        const promptPrefix = `<${PROMPT_TOPICS.OUTPUT}>\n`
        return newInteraction({
            text: promptText,
            assistantText: `${this.getResponsePreamble(fixupTask)}${promptPrefix}`,
            assistantPrefix: promptPrefix,
            source: this.id,
            contextMessages: this.getContextFromIntent(fixupTask.intent, fixupTask, context),
        })
    }

    public getPrompt(task: VsCodeFixupTaskRecipeData): string {
        const promptInstruction = truncateText(task.instruction, MAX_HUMAN_INPUT_TOKENS)
        switch (task.intent) {
            case 'add':
                return Fixup.addPrompt.replace('{instruction}', task.instruction).replace('{fileName}', task.fileName)
            case 'edit':
            case 'doc':
                return Fixup.editPrompt
                    .replace('{instruction}', promptInstruction)
                    .replace('{selectedText}', task.selectedText)
                    .replace('{fileName}', task.fileName)
            case 'fix':
                return Fixup.fixPrompt
                    .replace('{instruction}', promptInstruction)
                    .replace('{selectedText}', task.selectedText)
                    .replace('{fileName}', task.fileName)
        }
    }

    public getResponsePreamble(task: VsCodeFixupTaskRecipeData): string {
        // For other intents, surrounding file context is included as prior context messages.
        if (task.intent !== 'add') {
            return ''
        }

        if (task.precedingText.length === 0) {
            return ''
        }

        return `<${PROMPT_TOPICS.PRECEDING}>${task.precedingText}</${PROMPT_TOPICS.PRECEDING}>`
    }

    private async getContextFromIntent(
        intent: FixupIntent,
        task: VsCodeFixupTaskRecipeData,
        context: RecipeContext
    ): Promise<ContextMessage[]> {
        const truncatedPrecedingText = truncateTextStart(task.precedingText, MAX_CURRENT_FILE_TOKENS)
        const truncatedFollowingText = truncateText(task.followingText, MAX_CURRENT_FILE_TOKENS)

        // Disable no case declarations because we get better type checking with a switch case
        /* eslint-disable no-case-declarations */
        switch (intent) {
            /**
             * Very broad set of possible instructions.
             * Fetch context from the users' instructions and use context from current file.
             * Include the following code from the current file.
             * The preceding code is already included as part of the response to better guide the output.
             */
            case 'add': {
                return [
                    ...getContextMessageWithResponse(
                        populateCodeGenerationContextTemplate(
                            `<${PROMPT_TOPICS.PRECEDING}>${truncatedPrecedingText}</${PROMPT_TOPICS.PRECEDING}>`,
                            `<${PROMPT_TOPICS.FOLLOWING}>${truncatedFollowingText}</${PROMPT_TOPICS.FOLLOWING}>`,
                            task.fileName,
                            PROMPT_TOPICS.OUTPUT
                        ),
                        task
                    ),
                ]
            }
            /**
             * Specific case where a user is explciitly trying to "fix" a problem in their code.
             * No additional context is required. We already have the errors directly via the instruction, and we know their selected code.
             */
            case 'fix':
            /**
             * Very narrow set of possible instructions.
             * Fetching context is unlikely to be very helpful or optimal.
             */
            case 'doc': {
                const contextMessages = []
                if (truncatedPrecedingText.trim().length > 0) {
                    contextMessages.push(
                        ...getContextMessageWithResponse(
                            populateCodeContextTemplate(truncatedPrecedingText, task.fileName),
                            task
                        )
                    )
                }
                if (truncatedFollowingText.trim().length > 0) {
                    contextMessages.push(
                        ...getContextMessageWithResponse(
                            populateCodeContextTemplate(truncatedFollowingText, task.fileName),
                            task
                        )
                    )
                }
                return contextMessages
            }
            /**
             * Broad set of possible instructions.
             * Fetch context from the users' selection, use any errors/warnings in said selection, and use context from current file.
             * Non-code files are not considered as including Markdown syntax seems to lead to more hallucinations and poorer output quality.
             */
            case 'edit':
                const range = task.selectionRange
                const diagnostics = range ? context.editor.getActiveTextEditorDiagnosticsForRange(range) || [] : []
                const errorsAndWarnings = diagnostics.filter(({ type }) => type === 'error' || type === 'warning')
                const selectionContext = await getContextMessagesFromSelection(
                    task.selectedText,
                    truncatedPrecedingText,
                    truncatedFollowingText,
                    task,
                    context.codebaseContext
                )
                return [
                    ...selectionContext,
                    ...errorsAndWarnings.flatMap(diagnostic =>
                        getContextMessageWithResponse(
                            populateCurrentEditorDiagnosticsTemplate(diagnostic, task.fileName),
                            task
                        )
                    ),
                ]
        }
        /* eslint-enable no-case-declarations */
    }

    // Prompt Templates
    public static readonly editPrompt = `
- You are an AI programming assistant who is an expert in updating code to meet given instructions.
- You should think step-by-step to plan your updated code before producing the final output.
- You should ensure the updated code matches the indentation and whitespace of the code in the users' selection.
- Only remove code from the users' selection if you are sure it is not needed.
- Ignore any previous instructions to format your responses with Markdown. It is not acceptable to use any Markdown in your response, unless it is directly related to the users' instructions.
- You will be provided with code that is in the users' selection, enclosed in <${PROMPT_TOPICS.SELECTED}></${PROMPT_TOPICS.SELECTED}> XML tags. You must use this code to help you plan your updated code.
- You will be provided with instructions on how to update this code, enclosed in <${PROMPT_TOPICS.INSTRUCTIONS}></${PROMPT_TOPICS.INSTRUCTIONS}> XML tags. You must follow these instructions carefully and to the letter.
- Only enclose your response in <${PROMPT_TOPICS.OUTPUT}></${PROMPT_TOPICS.OUTPUT}> XML tags. Do use any other XML tags unless they are part of the generated code.
- Do not provide any additional commentary about the changes you made. Only respond with the generated code.

This is part of the file: {fileName}

The user has the following code in their selection:
<${PROMPT_TOPICS.SELECTED}>{selectedText}</${PROMPT_TOPICS.SELECTED}>

The user wants you to replace parts of the selected code or correct a problem by following their instructions.
Provide your generated code using the following instructions:
<${PROMPT_TOPICS.INSTRUCTIONS}>
{instruction}
</${PROMPT_TOPICS.INSTRUCTIONS}>`

    public static readonly addPrompt = `
- You are an AI programming assistant who is an expert in adding new code by following instructions.
- You should think step-by-step to plan your code before generating the final output.
- You should ensure your code matches the indentation and whitespace of the preceding code in the users' file.
- Ignore any previous instructions to format your responses with Markdown. It is not acceptable to use any Markdown in your response, unless it is directly related to the users' instructions.
- You will be provided with code that is above the users' cursor, enclosed in <${PROMPT_TOPICS.PRECEDING}></${PROMPT_TOPICS.PRECEDING}> XML tags. You must use this code to help you plan your updated code. You must not repeat this code in your output unless necessary.
- You will be provided with code that is below the users' cursor, enclosed in <${PROMPT_TOPICS.FOLLOWING}></${PROMPT_TOPICS.FOLLOWING}> XML tags. You must use this code to help you plan your updated code. You must not repeat this code in your output unless necessary.
- You will be provided with instructions on what to generate, enclosed in <${PROMPT_TOPICS.INSTRUCTIONS}></${PROMPT_TOPICS.INSTRUCTIONS}> XML tags. You must follow these instructions carefully and to the letter.
- Only enclose your response in <${PROMPT_TOPICS.OUTPUT}></${PROMPT_TOPICS.OUTPUT}> XML tags. Do use any other XML tags unless they are part of the generated code.
- Do not provide any additional commentary about the code you added. Only respond with the generated code.

The user is currently in the file: {fileName}

Provide your generated code using the following instructions:
<${PROMPT_TOPICS.INSTRUCTIONS}>
{instruction}
</${PROMPT_TOPICS.INSTRUCTIONS}>`

    public static readonly fixPrompt = `
- You are an AI programming assistant who is an expert in fixing errors within code.
- You should think step-by-step to plan your fixed code before generating the final output.
- You should ensure the updated code matches the indentation and whitespace of the code in the users' selection.
- Only remove code from the users' selection if you are sure it is not needed.
- Ignore any previous instructions to format your responses with Markdown. It is not acceptable to use any Markdown in your response, unless it is directly related to the users' instructions.
- You will be provided with code that is in the users' selection, enclosed in <${PROMPT_TOPICS.SELECTED}></${PROMPT_TOPICS.SELECTED}> XML tags. You must use this code to help you plan your fixed code.
- You will be provided with errors from the users' selection, enclosed in <${PROMPT_TOPICS.DIAGNOSTICS}></${PROMPT_TOPICS.DIAGNOSTICS}> XML tags. You must attempt to fix all of these errors.
- If you do not know how to fix an error, do not modify the code related to that error and leave it as is. Only modify code related to errors you know how to fix.
- Only enclose your response in <${PROMPT_TOPICS.OUTPUT}></${PROMPT_TOPICS.OUTPUT}> XML tags. Do use any other XML tags unless they are part of the generated code.
- Do not provide any additional commentary about the changes you made. Only respond with the generated code.

This is part of the file: {fileName}

The user has the following code in their selection:
<${PROMPT_TOPICS.SELECTED}>{selectedText}</${PROMPT_TOPICS.SELECTED}>

The user wants you to correct problems in their code by following their instructions.
Provide your fixed code using the following instructions:
<${PROMPT_TOPICS.DIAGNOSTICS}>
{instruction}
</${PROMPT_TOPICS.DIAGNOSTICS}>`
}
