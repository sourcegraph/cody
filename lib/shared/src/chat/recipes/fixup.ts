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

    public static readonly promptPreamble = ''

    // Prompt Templates
    public static readonly prompt = `
    - You are an AI programming assistant who is an expert in rewriting code to meet given instructions.
    - You should think step-by-step to plan your rewritten code before producing the final output.
    - You should use code above and below the selection to help you plan your rewritten code.
    - You should use code below the selection to help you plan your rewritten code.
    - Unless you have reason to believe otherwise, you should assume that the user wants you to edit the code in their selection.
    - It is not acceptable to use Markdown in your response. You should not produce Markdown-formatted code blocks.
    - Enclose your response in <selection></selection> XML tags. Do not provide anything else.

    This is part of the file {fileName}.

    I have the following code above my selection:
    <aboveCode>
    {truncateTextStart}
    </aboveCode>

    I have the following code below my selection:
    <belowCode>
    {truncateFollowingText}
    </belowCode>

    I have the following code in my selection:
    <selectedCode>
    {selectedText}
    </selectedCode>

    I'd like you to rewrite it using the following instructions
    <instructions>
    {humanInput}
    </instructions>
`
}
