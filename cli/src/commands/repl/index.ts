import { Command } from 'commander'
import prompts from 'prompts'

import { Transcript } from '@sourcegraph/cody-shared/src/chat/transcript'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

import { getClient } from '../../client'
import { streamCompletions } from '../../client/completions'
import { interactionFromMessage } from '../../client/interactions'
import { getPreamble } from '../../client/preamble'

interface ReplCommandOptions {
    prompt?: string
}

export const replCommand = new Command('repl')
    .description('Cody repl')
    .option('-p, --prompt <value>', 'Give Cody a prompt')
    .action(run)

async function run({ prompt }: ReplCommandOptions, program: Command): Promise<void> {
    const { codebaseContext, intentDetector, completionsClient } = await getClient(program)

    let promptToUse = prompt
    if (prompt === undefined || prompt === '') {
        const response = await prompts({
            type: 'text',
            name: 'value',
            message: 'What do you want to ask Cody?',
        })

        promptToUse = response.value as string
    }

    const transcript = new Transcript()

    // TODO: Keep track of all user input if we add REPL mode

    const initialMessage: Message = { speaker: 'human', text: promptToUse }
    const messages: { human: Message; assistant?: Message }[] = [{ human: initialMessage }]
    for (const [index, message] of messages.entries()) {
        const interaction = await interactionFromMessage(
            message.human,
            intentDetector,
            // Fetch codebase context only for the last message
            index === messages.length - 1 ? codebaseContext : null
        )

        transcript.addInteraction(interaction)

        if (message.assistant?.text) {
            transcript.addAssistantResponse(message.assistant?.text)
        }
    }

    const { prompt: finalPrompt, contextFiles } = await transcript.getPromptForLastInteraction(
        getPreamble(codebaseContext.getCodebase())
    )
    transcript.setUsedContextFilesForLastInteraction(contextFiles)

    let text = ''
    streamCompletions(completionsClient, finalPrompt, {
        onChange: chunk => {
            text = chunk
        },
        onComplete: () => {
            console.log(text)
        },
        onError: err => {
            console.error(err)
        },
    })
}
