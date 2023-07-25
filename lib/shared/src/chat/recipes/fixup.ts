import { CodebaseContext } from '../../codebase-context'
import { ContextMessage } from '../../codebase-context/messages'
import { MAX_CURRENT_FILE_TOKENS, MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import { truncateText, truncateTextStart } from '../../prompt/truncation'
import { BufferedBotResponseSubscriber } from '../bot-response-multiplexer'
import { Interaction } from '../transcript/interaction'

import { contentSanitizer } from './helpers'
import { Recipe, RecipeContext, RecipeID } from './recipe'

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

        // Reconstruct Cody's prompt using user's context
        // Replace placeholders in reverse order to avoid collisions if a placeholder occurs in the input
        // TODO: Move prompt suffix from recipe to chat view. It has other subscribers.
        const promptText = Fixup.prompt
            .replace('{humanInput}', truncateText(humanChatInput, MAX_HUMAN_INPUT_TOKENS))
            .replace('{truncateFollowingText}', truncateText(selection.followingText, quarterFileContext))
            .replace('{selectedText}', selection.selectedText)
            .replace('{truncateTextStart}', truncateTextStart(selection.precedingText, quarterFileContext))
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
                this.getContextMessages(selection.selectedText, context.codebaseContext),
                []
            )
        )
    }

    // Get context from editor
    private async getContextMessages(text: string, codebaseContext: CodebaseContext): Promise<ContextMessage[]> {
        // const contextMessages: ContextMessage[] = await codebaseContext.getContextMessages(text, numResults)
        return Promise.resolve([])
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
