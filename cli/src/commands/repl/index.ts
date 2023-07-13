import { Command } from 'commander'
import prompts from 'prompts'

import { Transcript } from '@sourcegraph/cody-shared/src/chat/transcript'
import { SourcegraphIntentDetectorClient } from '@sourcegraph/cody-shared/src/intent-detector/client'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { isRepoNotFoundError } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

import { streamCompletions } from '../../completions'
import { createCodebaseContext } from '../../context'
import { interactionFromMessage } from '../../interactions'
import { getPreamble } from '../../preamble'
import { GlobalOptions } from '../../program'

interface ReplCommandOptions {
    prompt?: string
}

export const replCommand = new Command('repl')
    .description('Cody repl')
    .option('-p, --prompt <value>', 'Give Cody a prompt')
    .action(run)

async function run(_options: unknown, program: Command): Promise<void> {
    const {
        codebase,
        endpoint,
        context: contextType,
        debug,
        prompt,
    } = program.optsWithGlobals<GlobalOptions & ReplCommandOptions>()

    const accessToken: string | undefined = process.env.SRC_ACCESS_TOKEN
    if (accessToken === undefined || accessToken === '') {
        console.error(
            'No access token found. Set SRC_ACCESS_TOKEN to an access token created on the Sourcegraph instance.'
        )
        process.exit(1)
    }

    const sourcegraphClient = new SourcegraphGraphQLAPIClient({
        serverEndpoint: endpoint,
        accessToken,
        customHeaders: {},
    })

    let codebaseContext
    try {
        codebaseContext = await createCodebaseContext(sourcegraphClient, codebase, contextType, endpoint)
    } catch (error) {
        let errorMessage = ''
        if (isRepoNotFoundError(error)) {
            errorMessage =
                `Cody could not find the '${codebase}' repository on your Sourcegraph instance.\n` +
                'Please check that the repository exists and is entered correctly in the cody.codebase setting.'
        } else {
            errorMessage =
                `Cody could not connect to your Sourcegraph instance: ${error}\n` +
                'Make sure that cody.serverEndpoint is set to a running Sourcegraph instance and that an access token is configured.'
        }
        console.error(errorMessage)
        process.exit(1)
    }

    const intentDetector = new SourcegraphIntentDetectorClient(sourcegraphClient)

    const completionsClient = new SourcegraphNodeCompletionsClient({
        serverEndpoint: endpoint,
        accessToken,
        debugEnable: debug,
        customHeaders: {},
    })

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

    const { prompt: finalPrompt, contextFiles } = await transcript.getPromptForLastInteraction(getPreamble(codebase))
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
