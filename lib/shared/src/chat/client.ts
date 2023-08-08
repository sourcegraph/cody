import { error } from 'console'

import { createProviderConfig } from '../autocomplete/providers/createProvider'
import { ExecuteAutocompleteParams, ExecuteAutocompleteResult, InlineCompletionItem } from '../autocomplete/types'
import { CodebaseContext } from '../codebase-context'
import { ConfigurationWithAccessToken } from '../configuration'
import { Editor } from '../editor'
import { PrefilledOptions, withPreselectedOptions } from '../editor/withPreselectedOptions'
import { SourcegraphEmbeddingsSearchClient } from '../embeddings/client'
import { SourcegraphIntentDetectorClient } from '../intent-detector/client'
import { SourcegraphBrowserCompletionsClient } from '../sourcegraph-api/completions/browserClient'
import { CompletionsClientConfig, SourcegraphCompletionsClient } from '../sourcegraph-api/completions/client'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'
import { isError } from '../utils'

import { BotResponseMultiplexer } from './bot-response-multiplexer'
import { ChatClient } from './chat'
import { getPreamble } from './preamble'
import { getRecipe } from './recipes/browser-recipes'
import { RecipeID } from './recipes/recipe'
import { Transcript, TranscriptJSON } from './transcript'
import { ChatMessage } from './transcript/messages'
import { reformatBotMessage } from './viewHelpers'

export type { TranscriptJSON }
export { Transcript }

export type ClientInitConfig = Pick<
    ConfigurationWithAccessToken,
    | 'serverEndpoint'
    | 'codebase'
    | 'useContext'
    | 'accessToken'
    | 'customHeaders'
    | 'autocompleteAdvancedProvider'
    | 'autocompleteAdvancedAccessToken'
    | 'autocompleteAdvancedServerEndpoint'
>

export interface ClientInit {
    config: ClientInitConfig
    setMessageInProgress: (messageInProgress: ChatMessage | null) => void
    setTranscript: (transcript: Transcript) => void
    editor: Editor
    initialTranscript?: Transcript
    createCompletionsClient?: (config: CompletionsClientConfig) => SourcegraphCompletionsClient
}

export interface Client {
    readonly transcript: Transcript
    readonly isMessageInProgress: boolean
    submitMessage: (text: string) => Promise<void>
    executeRecipe: (
        recipeId: RecipeID,
        options?: {
            prefilledOptions?: PrefilledOptions
            humanChatInput?: string
            data?: any // returned as is
        }
    ) => Promise<void>
    reset: () => void
    executeAutocomplete: (params: ExecuteAutocompleteParams) => Promise<ExecuteAutocompleteResult>
    codebaseContext: CodebaseContext
    sourcegraphStatus: { authenticated: boolean; version: string }
    codyStatus: { enabled: boolean; version: string }
}

export async function createClient({
    config,
    setMessageInProgress,
    setTranscript,
    editor,
    initialTranscript,
    createCompletionsClient = config => new SourcegraphBrowserCompletionsClient(config),
}: ClientInit): Promise<Client | null> {
    const fullConfig = { debugEnable: false, ...config }

    const graphqlClient = new SourcegraphGraphQLAPIClient(fullConfig)
    const sourcegraphVersion = await graphqlClient.getSiteVersion()

    const sourcegraphStatus = { authenticated: false, version: '' }
    if (!isError(sourcegraphVersion)) {
        sourcegraphStatus.authenticated = true
        sourcegraphStatus.version = sourcegraphVersion
    }

    const codyStatus = await graphqlClient.isCodyEnabled()

    if (sourcegraphStatus.authenticated && codyStatus.enabled) {
        const completionsClient = createCompletionsClient(fullConfig)
        const chatClient = new ChatClient(completionsClient)

        const repoId = config.codebase ? await graphqlClient.getRepoIdIfEmbeddingExists(config.codebase) : null
        if (isError(repoId)) {
            throw new Error(
                `Cody could not access the '${config.codebase}' repository on your Sourcegraph instance. Details: ${repoId.message}`
            )
        }

        const embeddingsSearch = repoId ? new SourcegraphEmbeddingsSearchClient(graphqlClient, repoId, true) : null

        const codebaseContext = new CodebaseContext(config, config.codebase, embeddingsSearch, null, null)

        const intentDetector = new SourcegraphIntentDetectorClient(graphqlClient, completionsClient)

        const transcript = initialTranscript || new Transcript()

        let isMessageInProgress = false

        const sendTranscript = (data?: any): void => {
            if (isMessageInProgress) {
                const messages = transcript.toChat()
                setTranscript(transcript)
                const message = messages[messages.length - 1]
                if (data) {
                    message.data = data
                }
                setMessageInProgress(message)
            } else {
                setTranscript(transcript)
                if (data) {
                    setMessageInProgress({ data, speaker: 'assistant' })
                } else {
                    setMessageInProgress(null)
                }
            }
        }

        async function executeRecipe(
            recipeId: RecipeID,
            options?: {
                prefilledOptions?: PrefilledOptions
                humanChatInput?: string
                data?: any
            }
        ): Promise<void> {
            const humanChatInput = options?.humanChatInput ?? ''
            const recipe = getRecipe(recipeId)
            if (!recipe) {
                return
            }

            const interaction = await recipe.getInteraction(humanChatInput, {
                editor: options?.prefilledOptions ? withPreselectedOptions(editor, options.prefilledOptions) : editor,
                intentDetector,
                codebaseContext,
                responseMultiplexer: new BotResponseMultiplexer(),
                firstInteraction: transcript.isEmpty,
            })
            if (!interaction) {
                return
            }
            isMessageInProgress = true
            transcript.addInteraction(interaction)

            const { prompt, contextFiles } = await transcript.getPromptForLastInteraction(getPreamble(config.codebase))
            transcript.setUsedContextFilesForLastInteraction(contextFiles)

            const responsePrefix = interaction.getAssistantMessage().prefix ?? ''
            let rawText = ''
            chatClient.chat(prompt, {
                onChange(_rawText) {
                    rawText = _rawText

                    const text = reformatBotMessage(rawText, responsePrefix)
                    transcript.addAssistantResponse(text)

                    sendTranscript(options?.data)
                },
                onComplete() {
                    isMessageInProgress = false

                    const text = reformatBotMessage(rawText, responsePrefix)
                    transcript.addAssistantResponse(text)
                    sendTranscript(options?.data)
                },
                onError(error) {
                    // Display error message as assistant response
                    transcript.addErrorAsAssistantResponse(error)
                    isMessageInProgress = false
                    sendTranscript(options?.data)
                    console.error(`Completion request failed: ${error}`)
                },
            })
        }

        const executeAutocomplete = async function (
            params: ExecuteAutocompleteParams
        ): Promise<ExecuteAutocompleteResult> {
            const providerFactory = createProviderConfig(
                config,
                err => {
                    console.error(err)
                },
                completionsClient
            )

            const provider = providerFactory.create({
                /** A unique and descriptive identifier for the provider. */
                id: '1',
                prefix: 'if err != nil {',
                suffix: '',
                fileName: 'string',
                languageId: 'go',
                multiline: false,
                responsePercentage: 0.1,
                prefixPercentage: 0.6,
                suffixPercentage: 0.1,
                n: 1,
            })

            const items: InlineCompletionItem[] = []
            provider.generateCompletions(new AbortController().signal, [], undefined).then(response => {
                response.map(c =>
                    items.push({
                        insertText: c.content,
                        range: { start: params.position, end: params.position },
                    })
                )
            })
            return { items }
        }

        return {
            get transcript() {
                return transcript
            },
            get isMessageInProgress() {
                return isMessageInProgress
            },
            submitMessage(text: string) {
                return executeRecipe('chat-question', { humanChatInput: text })
            },
            executeRecipe,
            reset() {
                isMessageInProgress = false
                transcript.reset()
                sendTranscript()
            },
            executeAutocomplete,
            codebaseContext,
            sourcegraphStatus,
            codyStatus,
        }
    }

    return null
}
