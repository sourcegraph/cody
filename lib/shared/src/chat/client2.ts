import { CodebaseContext } from '../codebase-context'
import { Editor } from '../editor'
import { SourcegraphEmbeddingsSearchClient } from '../embeddings/client'
import { SourcegraphIntentDetectorClient } from '../intent-detector/client'
import { SourcegraphBrowserCompletionsClient } from '../sourcegraph-api/completions/browserClient'
import { SourcegraphCompletionsClient } from '../sourcegraph-api/completions/client'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'
import { isError } from '../utils'

import { BotResponseMultiplexer } from './bot-response-multiplexer'
import { ChatClient } from './chat'
import { ClientInit, ClientInitConfig } from './client'
import { getPreamble } from './preamble'
import { getRecipe } from './recipes/browser-recipes'
import { RecipeID } from './recipes/recipe'
import { MessageID } from './transcript/messages'
import { Transcript, TranscriptID } from './transcript/transcript2'
import { reformatBotMessage } from './viewHelpers'

export interface ChatStatus {
    sourcegraphStatus: { authenticated: boolean; version: string }
    codyStatus: { enabled: boolean; version: string }
}

export type MessageHandler = {
    // TODO(tjdevries): Should this actually be a ChatMessage? instead of just the text...
    //                  I think so, but I'm out of time for today
    onMessageChange: (transcriptID: TranscriptID, messageID: MessageID, message: string) => void
    onMessageComplete: (transcriptID: TranscriptID, messageID: MessageID, text: string) => void
    onMessageError: (transcriptID: TranscriptID, messageID: MessageID, error: string) => void
}

export class ChatHandler {
    constructor(
        private config: ClientInitConfig,
        private completionClient: SourcegraphCompletionsClient,
        public status: ChatStatus,
        private editor: Editor,
        private intentDetector: SourcegraphIntentDetectorClient,
        private codebaseContext: CodebaseContext,
        private transcripts: Map<TranscriptID, Transcript>,
        private messageHandler: MessageHandler
    ) {}

    // TODO: It kind of hurts that we have so much copied here.
    //          I think the only thing that gets copied between old and new are the transcripts?
    //          So it's possible we could pass some subset of the items or break this into smaller functions too.
    public static async init(init: ClientInit, messageHandler: MessageHandler): Promise<ChatHandler> {
        const config = { ...init.config, useContext: 'embeddings', experimentalLocalSymbols: false }
        const fullConfig = { debugEnable: false, ...config }
        const graphqlClient = new SourcegraphGraphQLAPIClient(fullConfig)
        const sourcegraphVersion = await graphqlClient.getSiteVersion()

        const sourcegraphStatus = { authenticated: false, version: '' }
        if (!isError(sourcegraphVersion)) {
            sourcegraphStatus.authenticated = true
            sourcegraphStatus.version = sourcegraphVersion
        }

        const codyStatus = await graphqlClient.isCodyEnabled()
        const status = { sourcegraphStatus, codyStatus }

        const createCompletionsClient =
            init.createCompletionsClient || (config => new SourcegraphBrowserCompletionsClient(config))
        const completionClient = createCompletionsClient(fullConfig)

        const repoId = config.codebase ? await graphqlClient.getRepoIdIfEmbeddingExists(config.codebase) : null
        if (isError(repoId)) {
            throw new Error(
                `Cody could not access the '${config.codebase}' repository on your Sourcegraph instance. Details: ${repoId.message}`
            )
        }

        const embeddingsSearch = repoId ? new SourcegraphEmbeddingsSearchClient(graphqlClient, repoId, true) : null
        const codebaseContext = new CodebaseContext(init.config, config.codebase, embeddingsSearch, null, null, null)
        const intentDetector = new SourcegraphIntentDetectorClient(graphqlClient, completionClient)

        return new ChatHandler(
            init.config,
            completionClient,
            status,
            init.editor,
            intentDetector,
            codebaseContext,
            new Map(),
            messageHandler
        )
    }

    public async resetClient(init: ClientInit): Promise<void> {
        const config = init.config
        this.config = { ...config, useContext: 'embeddings', experimentalLocalSymbols: false }
        this.editor = init.editor

        const fullConfig = { debugEnable: false, ...config }
        const graphqlClient = new SourcegraphGraphQLAPIClient(fullConfig)
        const sourcegraphVersion = await graphqlClient.getSiteVersion()

        const sourcegraphStatus = { authenticated: false, version: '' }
        if (!isError(sourcegraphVersion)) {
            sourcegraphStatus.authenticated = true
            sourcegraphStatus.version = sourcegraphVersion
        }

        const codyStatus = await graphqlClient.isCodyEnabled()
        this.status = { sourcegraphStatus, codyStatus }
        if (!sourcegraphStatus.authenticated || !codyStatus.enabled) {
            // TODO: Should clear all the available items...?
            return
        }

        const createCompletionsClient =
            init.createCompletionsClient || (config => new SourcegraphBrowserCompletionsClient(config))
        this.completionClient = createCompletionsClient(fullConfig)

        const repoId = config.codebase ? await graphqlClient.getRepoIdIfEmbeddingExists(config.codebase) : null
        if (isError(repoId)) {
            throw new Error(
                `Cody could not access the '${config.codebase}' repository on your Sourcegraph instance. Details: ${repoId.message}`
            )
        }

        const embeddingsSearch = repoId ? new SourcegraphEmbeddingsSearchClient(graphqlClient, repoId, true) : null
        this.codebaseContext = new CodebaseContext(config, config.codebase, embeddingsSearch, null, null, null)
        this.intentDetector = new SourcegraphIntentDetectorClient(graphqlClient, this.completionClient)

        return
    }

    private isValidAuth(): boolean {
        return this.status.sourcegraphStatus.authenticated && this.status.codyStatus.enabled
    }

    public newTranscript(): TranscriptID {
        const transcript = new Transcript()
        this.transcripts.set(transcript.id, transcript)
        return transcript.id
    }

    // TODO(tjdevries): Should execute recipe allow for nil transcript to simply run a "fresh" recipe?
    //          I think this actually makes quite a bit of sense, because for one-shot commands
    //          and for basically any "CodyAsk" you would always want a fresh conversation.
    //
    //          Otherwise it gets way too confused. So perhaps default is actually not providing
    //          a transcript, and instead creates a new one and returns the corresponding transcriptID?
    public async executeRecipe(
        transcriptID: TranscriptID,
        recipeID: RecipeID,
        humanChatInput: string,
        options: { signal?: AbortSignal }
    ) {
        // TODO: Probably should error? Or send an auth message.
        // It's bad that we just silently stop doing stuff or just log to console in so many places
        if (!this.isValidAuth()) {
            return
        }

        const transcript = this.transcripts.get(transcriptID)!
        const chatClient = new ChatClient(this.completionClient)

        const recipe = getRecipe(recipeID)!
        const interaction = await recipe.getInteraction(humanChatInput, {
            // editor: options?.prefilledOptions ? withPreselectedOptions(editor, options.prefilledOptions) : editor,
            editor: this.editor,
            intentDetector: this.intentDetector,
            codebaseContext: this.codebaseContext,
            // TODO: I don't get why we have this?
            responseMultiplexer: new BotResponseMultiplexer(),
            firstInteraction: transcript.isEmpty,
        })

        if (!interaction) {
            return // TODO: Error
        }

        const messageID = interaction.getHumanMessage().id!

        const { prompt, contextFiles, preciseContexts } = await transcript.getPromptForLastInteraction(
            getPreamble(this.config.codebase)
        )

        // TODO: This seems terrible, why doesn't this update the interaction directly?
        //  or get generated when creating the interaction?
        //  ISNT THIS JUST PUTTING THE STUFF BACK THAT WAS ALREADY THERE?
        transcript.setUsedContextFilesForLastInteraction(contextFiles, preciseContexts)

        const responsePrefix = interaction.getAssistantMessage().prefix ?? ''

        // TODO: I don't know why we did this in each of the message possibilities:
        //          Instead, we should just use IDs and then agents can be responsible for
        //          for updating the corresponding transcript.
        // sendTranscript(options?.data)

        let responseText = ''
        const chatCompletionPromise = new Promise<void>((resolve, reject) => {
            const onAbort = chatClient.chat(prompt, {
                onChange: (rawText: string) => {
                    const text = reformatBotMessage(rawText, responsePrefix)
                    transcript.addAssistantResponse(text)

                    this.messageHandler.onMessageChange(transcriptID, messageID, text)
                    responseText = text
                },
                onComplete: () => {
                    this.messageHandler.onMessageComplete(transcriptID, messageID, responseText)

                    resolve()
                },
                onError: error => {
                    // Display error message as assistant response
                    transcript.addErrorAsAssistantResponse(messageID, error)
                    this.messageHandler.onMessageError(transcriptID, messageID, error)

                    console.error(`Completion request failed: ${error}`)
                    reject(new Error(error))
                },
            })

            options?.signal?.addEventListener('abort', onAbort)
        })

        // Not 100% sure why we do this, I guess it's to pass the error up?
        //  It seems we could just skip making the promise and just do all the
        //  work we need in the callbacks.
        await chatCompletionPromise
    }

    public async createNewChatMessage(
        transcriptID: TranscriptID,
        humanChatInput: string,
        options: { signal?: AbortSignal }
    ) {
        // I would like to... not just execute a recipe, but that's going to have to wait for a separate PR
        await this.executeRecipe(transcriptID, 'chat-question', humanChatInput, options)
    }
}
