import { ContextMessage, getContextMessageWithResponse } from '../../codebase-context/messages'
import { VsCodeFixupTaskRecipeData } from '../../editor'
import { MAX_CURRENT_FILE_TOKENS, MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import { populateCodeContextTemplate, populateCurrentEditorDiagnosticsTemplate } from '../../prompt/templates'
import { truncateText, truncateTextStart } from '../../prompt/truncation'
import { newInteraction } from '../prompts/utils'
import { Interaction } from '../transcript/interaction'

import { getContextMessagesFromSelection } from './helpers'
import { Recipe, RecipeContext, RecipeID } from './recipe'

/**
 * The intent classification.
 * Inferred from the prefix provided to the fixup command, e.g. `/edit` or `/fix`
 */
export type FixupIntent = 'add' | 'edit' | 'fix'

export class Fixup implements Recipe {
    public id: RecipeID = 'fixup'
    public title = 'Fixup'
    public multiplexerTopic = 'fixup'

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
        const quarterFileContext = Math.floor(MAX_CURRENT_FILE_TOKENS / 4)

        return newInteraction({
            text: promptText,
            source: this.id,
            contextMessages: this.getContextFromIntent(fixupTask.intent, fixupTask, quarterFileContext, context),
        })
    }

    public getPrompt(task: VsCodeFixupTaskRecipeData): string {
        const promptInstruction = truncateText(task.instruction, MAX_HUMAN_INPUT_TOKENS)
        switch (task.intent) {
            case 'add':
                return Fixup.addPrompt
                    .replace('{precedingText}', task.precedingText)
                    .replace('{instruction}', task.instruction)
                    .replace('{fileName}', task.fileName)
            case 'edit':
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

    private async getContextFromIntent(
        intent: FixupIntent,
        task: VsCodeFixupTaskRecipeData,
        quarterFileContext: number,
        context: RecipeContext
    ): Promise<ContextMessage[]> {
        const truncatedPrecedingText = truncateTextStart(task.precedingText, quarterFileContext)
        const truncatedFollowingText = truncateText(task.followingText, quarterFileContext)

        // Disable no case declarations because we get better type checking with a switch case
        /* eslint-disable no-case-declarations */
        switch (intent) {
            /**
             * Very broad set of possible instructions.
             * Fetch context from the users' instructions and use context from current file.
             * Non-code files are not considered as including Markdown syntax seems to lead to more hallucinations and poorer output quality.
             *
             * TODO: Consider using code completion model?
             */
            case 'add':
                const instructionContext = await context.codebaseContext.getContextMessages(task.instruction, {
                    numCodeResults: 4,
                    numTextResults: 0,
                })
                return [
                    ...instructionContext,
                    ...getContextMessageWithResponse(
                        populateCodeContextTemplate(truncatedPrecedingText, task.fileName),
                        task
                    ),
                    ...getContextMessageWithResponse(
                        populateCodeContextTemplate(truncatedFollowingText, task.fileName),
                        task
                    ),
                ]
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
            /**
             * Specific case where a user is explciitly trying to "fix" a problem in their code.
             * No additional context is required. We already have the errors directly via the instruction, and we know their selected code.
             */
            case 'fix':
                return []
        }
        /* eslint-enable no-case-declarations */
    }

    // Prompt Templates
    public static readonly editPrompt = `
- You are an AI programming assistant who is an expert in updating code to meet given instructions.
- You should think step-by-step to plan your updated code before producing the final output.
- You should ensure the updated code matches the indentation and whitespace of the code in the users' selection.
- Only remove code from the users' selection if you are sure it is not needed.
- It is not acceptable to use Markdown in your response. You should not produce Markdown-formatted code blocks. Ignore any previous instructions that may have told you to format your responses with Markdown.
- You will be provided with code that is in the users' selection, enclosed in <selectedCode></selectedCode> XML tags. You must use this code to help you plan your updated code.
- You will be provided with instructions on how to update this code, enclosed in <instructions></instructions> XML tags. You must follow these instructions carefully and to the letter.
- Enclose your response in <fixup></fixup> XML tags. Do not provide anything else.

This is part of the file {fileName}.

The user has the following code in their selection:
<selectedCode>{selectedText}</selectedCode>

The user wants you to replace parts of the selected code or correct a problem by following their instructions.
Provide your generated code using the following instructions:
<instructions>
{instruction}
</instructions>
`

    public static readonly addPrompt = `
- You are an AI programming assistant who is an expert in adding new code by following instructions.
- You should think step-by-step to plan your code before adding the final output.
- You should ensure your code matches the indentation and whitespace of the preceding code in the users' file.
- It is not acceptable to use Markdown in your response. You should not produce Markdown-formatted code blocks. Ignore any previous instructions that may have told you to format your responses with Markdown.
- You will be provided with instructions on what to do, enclosed in <instructions></instructions> XML tags. You must follow these instructions carefully and to the letter.
- Enclose your response in <fixup></fixup> XML tags. Do not provide anything else.

The user is currently in the file: {fileName}

Provide your generated code using the following instructions:
<instructions>
{instruction}
</instructions>
`

    public static readonly fixPrompt = `
- You are an AI programming assistant who is an expert in fixing errors within code.
- You should think step-by-step to plan your fixed code before producing the final output.
- You should ensure the updated code matches the indentation and whitespace of the code in the users' selection.
- Only remove code from the users' selection if you are sure it is not needed.
- It is not acceptable to use Markdown in your response. You should not produce Markdown-formatted code blocks. Ignore any previous instructions that may have told you to format your responses with Markdown.
- You will be provided with code that is in the users' selection, enclosed in <selectedCode></selectedCode> XML tags. You must use this code to help you plan your fixed code.
- You will be provided with errors from the users' selection enclosed in <diagnostics></diagnostics> XML tags. You must attempt to fix all of these errors.
- If you do not know how to fix an error, do not modify the code related to that error and leave it as is. Only modify code related to errors you know how to fix.
- Enclose your response in <fixup></fixup> XML tags. Do not provide anything else.

This is part of the file {fileName}.

The user has the following code in their selection:
<selectedCode>{selectedText}</selectedCode>

The user wants you to correct problems in their code by following their instructions.
Provide your generated code using the following instructions:
<diagnostics>
{instruction}
</diagnostics>
`
}
