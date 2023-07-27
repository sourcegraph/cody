import { ContextMessage } from '../../codebase-context/messages'
import { IntentClassificationOption } from '../../intent-detector'
import { MAX_CURRENT_FILE_TOKENS, MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import { truncateText, truncateTextStart } from '../../prompt/truncation'
import { BufferedBotResponseSubscriber } from '../bot-response-multiplexer'
import { Interaction } from '../transcript/interaction'

import { contentSanitizer, getContextMessagesFromSelection, numResults } from './helpers'
import { Recipe, RecipeContext, RecipeID } from './recipe'

type FixupIntent = 'add' | 'edit' | 'fix' | 'document' | 'test'
const FixupIntentClassification: IntentClassificationOption<FixupIntent>[] = [
    {
        id: 'add',
        description: 'Add new code to complement the selected code',
        examplePrompts: ['Add a new function', 'Add a new class'],
    },
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
    {
        id: 'test',
        description: 'Generate tests for the selected code',
        examplePrompts: ['Write a test for this function', 'Add a test for this code'],
    },
]

const PromptIntentInstruction: Record<FixupIntent, string> = {
    add: 'The user wants you to add new code to the selected code by following their instructions.',
    edit: 'The user wants you to replace code inside the selected code by following their instructions.',
    fix: 'The user wants you to correct a problem in the selected code by following their instructions.',
    document: 'The user wants you to add documentation or comments to the selected code.',
    test: 'The user wants you to generate a test or multiple tests for the selected code.',
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

        const intent = await context.intentDetector.classifyIntentFromOptions(
            humanChatInput,
            FixupIntentClassification,
            'fix'
        )
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
        console.log('INLINE FIXUP INTENT', intent)
        switch (intent) {
            case 'add':
            case 'edit':
            case 'fix':
                /**
                 * Fetch a small window of code context for the current selection.
                 * Include preceding and following text as additional context
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
                 * Fetch a small window of mixed code and text context for the current selection.
                 * We do not include preceding and following text as they may not be relevant here.
                 */
                dynamicContext = context.codebaseContext.getContextMessages(selection.selectedText, { numCodeResults: 2, numTextResults: 2 })
                break
            case 'test':
                // TODO: Better retrieval of test context. E.g. test files, dependencies, etc.
                dynamicContext = context.codebaseContext.getContextMessages(selection.selectedText, numResults)
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
    - You are an AI programming assistant who is an expert in rewriting code to meet given instructions.
    - You should think step-by-step to plan your rewritten code before producing the final output.
    - Unless you have reason to believe otherwise, you should assume that the user wants you to edit the code in their selection.
    - You should ensure the rewritten code matches the indentation and whitespace of the code in the users' selection.
    - It is not acceptable to use Markdown in your response. You should not produce Markdown-formatted code blocks.
    - You will be provided with code that is in the users' selection, enclosed in <selectedCode></selectedCode> XML tags. You must use this code to help you plan your rewritten code.
    - You will be provided with instructions on how to modify this code, enclosed in <instructions></instructions> XML tags. You must follow these instructions carefully and to the letter.
    - Enclose your response in <selection></selection> XML tags. Do not provide anything else.

    This is part of the file {fileName}.

    The user has the following code within their selection:
    <selectedCode>
    {selectedText}
    </selectedCode>

    The user wants you to {intent}
    Provide your generated code using the following instructions:
    <instructions>
    {humanInput}
    </instructions>`
}
