import { ContextMessage, getContextMessageWithResponse } from '../../codebase-context/messages'
import { ActiveTextEditorSelection } from '../../editor'
import { IntentClassificationOption } from '../../intent-detector'
import { MAX_CURRENT_FILE_TOKENS, MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import { populateCodeContextTemplate, populateCurrentEditorDiagnosticsTemplate } from '../../prompt/templates'
import { truncateText, truncateTextStart } from '../../prompt/truncation'
import { BufferedBotResponseSubscriber } from '../bot-response-multiplexer'
import { Interaction } from '../transcript/interaction'

import { contentSanitizer, getContextMessagesFromSelection } from './helpers'
import { Recipe, RecipeContext, RecipeID } from './recipe'

type FixupIntent = 'add' | 'edit' | 'delete' | 'fix' | 'test' | 'document'
const FixupIntentClassification: IntentClassificationOption<FixupIntent>[] = [
    {
        id: 'add',
        description: 'Add to the selected code',
        examplePrompts: ['Add a function that concatonates two strings', 'Add error handling'],
    },
    {
        id: 'edit',
        description: 'Edit part of the selected code',
        examplePrompts: ['Edit this code', 'Change this code', 'Update this code'],
    },
    {
        id: 'delete',
        description: 'Delete a part of the selection code',
        examplePrompts: ['Delete these comments', 'Remove log statements'],
    },
    {
        id: 'fix',
        description: 'Fix a problem in a part of the selected code',
        examplePrompts: ['Implement this TODO', 'Fix this code'],
    },
    {
        id: 'document',
        description: 'Generate documentation for parts of the selected code.',
        examplePrompts: ['Add a docstring for this function', 'Write comments to explain this code'],
    },
]

const PromptIntentInstruction: Record<FixupIntent, string> = {
    add: 'The user wants you to add to the selected code by following their instructions.',
    edit: 'The user wants you to replace parts of the selected code by following their instructions.',
    delete: 'The user wants you to remove parts of the selected code by following their instructions.',
    fix: 'The user wants you to correct a problem in the selected code by following their instructions.',
    document:
        'The user wants you to add documentation or comments to the selected code by following their instructions.',
    test: 'The user wants you to add, update or fix a test by following their instructions',
}

export class Fixup implements Recipe {
    public id: RecipeID = 'fixup'

    public async getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null> {
        // TODO: Prompt the user for additional direction.
        const selection = context.editor.getActiveTextEditorSelection() || context.editor.controllers?.inline?.selection
        if (!selection) {
            await context.editor.controllers?.inline?.error()
            await context.editor.showWarningMessage('Select some code to fixup.')
            return null
        }
        const quarterFileContext = Math.floor(MAX_CURRENT_FILE_TOKENS / 4)
        if (truncateText(selection.selectedText, quarterFileContext * 2) !== selection.selectedText) {
            const msg = "The amount of text selected exceeds Cody's current capacity."
            await context.editor.controllers?.inline?.error()
            await context.editor.showWarningMessage(msg)
            return null
        }

        const intent = await this.getIntent(humanChatInput, context)

        // Reconstruct Cody's prompt using user's context and intent
        // Replace placeholders in reverse order to avoid collisions if a placeholder occurs in the input
        // TODO: Move prompt suffix from recipe to chat view. It has other subscribers.
        const promptText = Fixup.prompt
            .replace('{humanInput}', truncateText(humanChatInput, MAX_HUMAN_INPUT_TOKENS))
            .replace('{selectedText}', selection.selectedText)
            .replace('{fileName}', selection.fileName)
            .replace('{intent}', PromptIntentInstruction[intent])

        context.responseMultiplexer.sub(
            'selection',
            new BufferedBotResponseSubscriber(async content => {
                if (!content) {
                    await context.editor.controllers?.inline?.error()
                    await context.editor.showWarningMessage(
                        'Cody did not suggest any replacement.\nTry starting a new conversation with Cody.'
                    )
                    return
                }
                await context.editor.replaceSelection(
                    selection.fileName,
                    selection.selectedText,
                    contentSanitizer(content)
                )
            })
        )

        return Promise.resolve(
            new Interaction(
                {
                    speaker: 'human',
                    text: promptText,
                    displayText: '**✨Fixup✨** ' + humanChatInput,
                },
                {
                    speaker: 'assistant',
                    prefix: 'Check your document for updates from Cody.\n',
                },
                this.getContextFromIntent(intent, selection, quarterFileContext, context),
                []
            )
        )
    }

    private async getIntent(humanChatInput: string, context: RecipeContext): Promise<FixupIntent> {
        /**
         * TODO(umpox): We should probably find a shorter way of detecting intent when possible.
         * Possible methods:
         * - Input -> Match first word against update|fix|add|delete verbs
         * - Context -> Infer intent from context, e.g. Current file is a test -> Test intent, Current selection is a comment symbol -> Documentation intent
         */
        const intent = await context.intentDetector.classifyIntentFromOptions(
            humanChatInput,
            FixupIntentClassification,
            'fix'
        )
        return intent
    }

    private async getContextFromIntent(
        intent: FixupIntent,
        selection: ActiveTextEditorSelection,
        quarterFileContext: number,
        context: RecipeContext
    ): Promise<ContextMessage[]> {
        const truncatedPrecedingText = truncateTextStart(selection.precedingText, quarterFileContext)
        const truncatedFollowingText = truncateText(selection.followingText, quarterFileContext)

        // Disable no case declarations because we get better type checking with a switch case
        /* eslint-disable no-case-declarations */
        switch (intent) {
            /**
             * Intents that are focused on producing new code.
             * They have a broad set of possible instructions, so we fetch a broad amount of code context files.
             * Non-code files are not considered as including Markdown syntax seems to lead to more hallucinations and poorer output quality.
             *
             * TODO(umpox): We fetch similar context for both cases here
             * We should investigate how we can improve each individual case.
             * Are these fundamentally the same? Is the primary benefit here that we can provide more specific instructions to Cody?
             */
            case 'add':
            case 'edit':
                return getContextMessagesFromSelection(
                    selection.selectedText,
                    truncatedPrecedingText,
                    truncatedFollowingText,
                    selection,
                    context.codebaseContext
                )
            /**
             * The fix intent is similar to adding or editing code, but with additional context that we can include from the editor.
             */
            case 'fix':
                const range =
                    context.editor.getActiveTextEditor()?.selectionRange ||
                    context.editor.controllers?.inline?.selectionRange
                const diagnostics = range ? context.editor.getActiveTextEditorDiagnosticsForRange(range) || [] : []
                const errorsAndWarnings = diagnostics.filter(({ type }) => type === 'error' || type === 'warning')

                return getContextMessagesFromSelection(
                    selection.selectedText,
                    truncatedPrecedingText,
                    truncatedFollowingText,
                    selection,
                    context.codebaseContext
                ).then(messages =>
                    messages.concat(
                        errorsAndWarnings.flatMap(diagnostic =>
                            getContextMessageWithResponse(
                                populateCurrentEditorDiagnosticsTemplate(diagnostic, selection.fileName),
                                selection
                            )
                        )
                    )
                )
            /**
             * The test intent is unique in that we likely want to be much more specific in that context that we retrieve.
             * TODO(umpox): How can infer the current testing dependencies, etc?
             */
            case 'test':
                // Currently the same as add|edit|fix
                return getContextMessagesFromSelection(
                    selection.selectedText,
                    truncatedPrecedingText,
                    truncatedFollowingText,
                    selection,
                    context.codebaseContext
                )
            /**
             * Intents that are focused primarily on updating code within the current file and selection.
             * Providing a much more focused context window here seems to provide better quality responses.
             */
            case 'delete':
            case 'document':
                return Promise.resolve(
                    [truncatedPrecedingText, truncatedFollowingText].flatMap(text =>
                        getContextMessageWithResponse(
                            populateCodeContextTemplate(text, selection.fileName, selection.repoName),
                            selection
                        )
                    )
                )
        }
        /* eslint-enable no-case-declarations */
    }

    // Prompt Templates
    public static readonly prompt = `
    - You are an AI programming assistant who is an expert in updating code to meet given instructions.
    - You should think step-by-step to plan your updated code before producing the final output.
    - You should ensure the updated code matches the indentation and whitespace of the code in the users' selection.
    - Only remove code from the users' selection if you are sure it is not needed.
    - It is not acceptable to use Markdown in your response. You should not produce Markdown-formatted code blocks.
    - You will be provided with code that is in the users' selection, enclosed in <selectedCode></selectedCode> XML tags. You must use this code to help you plan your updated code.
    - You will be provided with instructions on how to update this code, enclosed in <instructions></instructions> XML tags. You must follow these instructions carefully and to the letter.
    - Enclose your response in <selection></selection> XML tags. Do not provide anything else.

    This is part of the file {fileName}.

    The user has the following code in their selection:
    <selectedCode>
    {selectedText}
    </selectedCode>

    {intent}
    Provide your generated code using the following instructions:
    <instructions>
    {humanInput}
    </instructions>`
}
