import { ContextMessage, getContextMessageWithResponse } from '../../codebase-context/messages'
import { IntentClassificationOption } from '../../intent-detector'
import { MAX_CURRENT_FILE_TOKENS, MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import { populateCodeContextTemplate } from '../../prompt/templates'
import { truncateText, truncateTextStart } from '../../prompt/truncation'
import { BufferedBotResponseSubscriber } from '../bot-response-multiplexer'
import { Interaction } from '../transcript/interaction'

import { contentSanitizer, getContextMessagesFromSelection } from './helpers'
import { Recipe, RecipeContext, RecipeID } from './recipe'

type FixupIntent = 'edit' | 'fix' | 'document'
const FixupIntentClassification: IntentClassificationOption<FixupIntent>[] = [
    {
        id: 'edit',
        description: 'Edit the selected code',
        examplePrompts: ['Edit this code', 'Change this code', 'Update this code'],
    },
    {
        id: 'fix',
        description: 'Fix a problem in the selected code',
        examplePrompts: ['Implement this TODO', 'Fix this code'],
    },
    {
        id: 'document',
        description: 'Generate documentation for the selected code.',
        examplePrompts: ['Add a docstring for this function', 'Write comments to explain this code'],
    },
]

const PromptIntentInstruction: Record<FixupIntent, string> = {
    edit: 'The user wants you to replace code inside the selected code by following their instructions.',
    fix: 'The user wants you to correct a problem in the selected code by following their instructions.',
    document:
        'The user wants you to add documentation or comments to the selected code by following their instructions.',
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

        const truncatedPrecedingText = truncateTextStart(selection.precedingText, quarterFileContext)
        const truncatedFollowingText = truncateText(selection.followingText, quarterFileContext)
        const intent = await context.intentDetector.classifyIntentFromOptions(
            humanChatInput,
            FixupIntentClassification,
            'fix'
        )

        // Reconstruct Cody's prompt using user's context
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

        let dynamicContext: Promise<ContextMessage[]>
        switch (intent) {
            case 'edit':
            case 'fix': // TODO(umpox): For fixing code, can we extract warnings + errors from within the selection?
                /**
                 * Fetch a small window of code context for the current selection.
                 * Includes preceding and following text as additional context.
                 */
                dynamicContext = getContextMessagesFromSelection(
                    selection.selectedText,
                    truncatedPrecedingText,
                    truncatedFollowingText,
                    selection,
                    context.codebaseContext
                )
                break
            case 'document':
                /**
                 * Includes code context from the current file only.
                 * Including context from other files is unlikely to be useful, and seems to reduce response quality.
                 */
                dynamicContext = Promise.resolve(
                    [truncatedPrecedingText, truncatedFollowingText].flatMap(text =>
                        getContextMessageWithResponse(
                            populateCodeContextTemplate(text, selection.fileName, selection.repoName),
                            selection
                        )
                    )
                )
                break
        }

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
                dynamicContext,
                []
            )
        )
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

    The user has the following code within their selection:
    <selectedCode>
    {selectedText}
    </selectedCode>

    {intent}
    Provide your generated code using the following instructions:
    <instructions>
    {humanInput}
    </instructions>`
}
