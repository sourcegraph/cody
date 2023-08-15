import { MAX_RECIPE_INPUT_TOKENS, MAX_RECIPE_SURROUNDING_TOKENS } from '../../prompt/constants'
import { truncateText, truncateTextStart } from '../../prompt/truncation'
import { Interaction, ResponseHandling } from '../transcript/interaction'

import { getContextMessagesFromSelection, getNormalizedLanguageName, MARKDOWN_FORMAT_PROMPT } from './helpers'
import { Recipe, RecipeContext, RecipeID } from './recipe'

class ExplainFirstInteraction extends Interaction {
    public override getNextInteraction(): Interaction | undefined {
        return new Interaction(
            {
                speaker: 'human',
                text: `Write a summary explaining the code to our colleague. Start with the purpose of this code. Then give the most interesting supporting details grounded in the facts from your earlier research. ${MARKDOWN_FORMAT_PROMPT}`,
                displayText: 'Explaining it.',
            },
            { speaker: 'assistant' },
            Promise.resolve([]),
            []
        )
    }
}

export class ExplainCodeHighLevel implements Recipe {
    public id: RecipeID = 'explain-code-high-level'

    public async getInteraction(_humanChatInput: string, context: RecipeContext): Promise<Interaction | null> {
        const selection = context.editor.getActiveTextEditorSelectionOrEntireFile()
        if (!selection) {
            await context.editor.showWarningMessage('No code selected. Please select some code and try again.')
            return Promise.resolve(null)
        }

        const truncatedSelectedText = truncateText(selection.selectedText, MAX_RECIPE_INPUT_TOKENS)
        const truncatedPrecedingText = truncateTextStart(selection.precedingText, MAX_RECIPE_SURROUNDING_TOKENS)
        const truncatedFollowingText = truncateText(selection.followingText, MAX_RECIPE_SURROUNDING_TOKENS)

        const languageName = getNormalizedLanguageName(selection.fileName)
        const promptMessage = `We need to read and understand this ${languageName} code to explain to our colleague
what it does and how it works. Our colleague is an busy, experienced
software developer. Answer the following questions:

1. What is the purpose of this code? Does this code realize its
intended purpose? Is the complexity of the code commensurate with the
complexity of the problem?

2. How would someone use this code correctly? What would they need to
be careful to do?

3. What are the notable implementation details of this code--data
structures, algorithms, concurrency/reentrancy, resource management,
etc.?

4. What are the notable "engineering" details of this code--system
integration, error handling, secure coding, dependencies, etc.

When you reply, find exact code relevant and write them down
word-for-word inside <thinking></thinking> XML tags. This is space for
you to write down relevant content and will not be show to the
user. Once you are done extracting relevant code, respond with
detailed observations related to each topic area.

Here is the code from ${selection.fileName}:

\`\`\`
${truncatedSelectedText}
\`\`\`
${MARKDOWN_FORMAT_PROMPT}`

        const displayText = `Reading ${selection.fileName} and related code.`

        return new ExplainFirstInteraction(
            { speaker: 'human', text: promptMessage, displayText },
            { speaker: 'assistant' },
            getContextMessagesFromSelection(
                truncatedSelectedText,
                truncatedPrecedingText,
                truncatedFollowingText,
                selection,
                context.codebaseContext
            ),
            [],
            undefined,
            undefined,
            ResponseHandling.HIDE
        )
    }
}
