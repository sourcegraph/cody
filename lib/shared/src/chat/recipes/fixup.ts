import { ContextMessage } from '../../codebase-context/messages'
import { IntentClassificationOption } from '../../intent-detector'
import { MAX_CURRENT_FILE_TOKENS, MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import { truncateText, truncateTextStart } from '../../prompt/truncation'
import { BufferedBotResponseSubscriber } from '../bot-response-multiplexer'
import { Interaction } from '../transcript/interaction'

import { contentSanitizer, getContextMessagesFromSelection, numResults } from './helpers'
import { Recipe, RecipeContext, RecipeID } from './recipe'

const FixupIntentClassification: IntentClassificationOption[] = [
    {
        /**
         * Context:
         * - preceding text, selected text, following text
         * - maximum embeddings from code files and text files
         */
        id: 'explain',
        description: 'Explain the selected code',
        examplePrompts: ['What does this code do?', 'How does this code work?'],
    },
    {
        /**
         * Context:
         * - preceding text, selected text, following text
         * - limited embeddings from code files
         */
        id: 'fix', // mostly context from current file, code files
        description: 'Fix a problem in the selected code',
        examplePrompts: ['Update this code to use async/await', 'Fix this code'],
    },
    {
        /**
         * Context:
         * - selected text
         * - limited embeddings from code files
         */
        id: 'document', // only the current selection, context
        description: 'Generate documentation for the selected code.',
        examplePrompts: ['Add a docstring for this function', 'Write comments to explain this code'],
    },
    {
        /**
         * Context:
         * - preceding text, selected text, following text
         * - limited embeddings from code files
         */
        id: 'test',
        description: 'Generate tests for the selected code',
        examplePrompts: ['Write a test for this function', 'Add a test for this code'],
    },
]

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

        // Reconstruct Cody's prompt using user's context
        // Replace placeholders in reverse order to avoid collisions if a placeholder occurs in the input
        // TODO: Move prompt suffix from recipe to chat view. It has other subscribers.
        const promptText = Fixup.prompt
            .replace('{humanInput}', truncateText(humanChatInput, MAX_HUMAN_INPUT_TOKENS))
            .replace('{truncateTextStart}', truncatedPrecedingText)
            .replace('{selectedText}', selection.selectedText)
            .replace('{truncateFollowingText}', truncatedFollowingText)
            .replace('{fileName}', selection.fileName)

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
        const intent = await context.intentDetector.classifyIntentFromOptions(humanChatInput, FixupIntentClassification)
        console.log('INLINE FIXUP INTENT', intent)
        switch (intent) {
            case 'explain':
                dynamicContext = context.codebaseContext.getContextMessages(selection.selectedText, numResults)
                break
            case 'fix':
                dynamicContext = getContextMessagesFromSelection(
                    selection.selectedText,
                    truncatedPrecedingText,
                    truncatedFollowingText,
                    selection,
                    context.codebaseContext
                )
                break
            case 'document':
                // todo: better context gather for documenting? currently just using selection - no context
                dynamicContext = Promise.resolve([])
                break
            case 'test':
                // todo: better context gathering for tests
                dynamicContext = context.codebaseContext.getContextMessages(selection.selectedText, numResults)
                break
            default:
                dynamicContext = getContextMessagesFromSelection(
                    selection.selectedText,
                    truncatedPrecedingText,
                    truncatedFollowingText,
                    selection,
                    context.codebaseContext
                )
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
    - You are an AI programming assistant who is an expert in rewriting code to meet given instructions.
    - You should think step-by-step to plan your rewritten code before producing the final output.
    - Unless you have reason to believe otherwise, you should assume that the user wants you to edit the code in their selection.
    - You should ensure the rewritten code matches the indentation and whitespace of the code in the users' selection.
    - It is not acceptable to use Markdown in your response. You should not produce Markdown-formatted code blocks.
    - You will be provided with code that is above the users' selection, enclosed in <aboveCode></aboveCode> XML tags. You can use this code, if relevant, to help you plan your rewritten code.
    - You will be provided with code that is below the users' selection, enclosed in <belowCode></belowCode> XML tags. You can use this code, if relevant, to help you plan your rewritten code.
    - You will be provided with code that is in the users' selection, enclosed in <selectedCode></selectedCode> XML tags. You must use this code to help you plan your rewritten code.
    - You will be provided with instructions on how to modify this code, enclosed in <instructions></instructions> XML tags. You must follow these instructions carefully and to the letter.
    - Enclose your response in <selection></selection> XML tags. Do not provide anything else.

    This is part of the file {fileName}.

    The user has the following code above their selection:
    <aboveCode>
    {truncateTextStart}
    </aboveCode>

    The user has the following code below their selection:
    <belowCode>
    {truncateFollowingText}
    </belowCode>

    The user has the following code within their selection:
    <selectedCode>
    {selectedText}
    </selectedCode>

    You should rewrite this code using the following instructions:
    <instructions>
    {humanInput}
    </instructions>`
}
