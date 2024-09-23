import type { Span } from '@opentelemetry/api'
import {
    BotResponseMultiplexer,
    type ChatClient,
    type CompletionParameters,
    type ContextItem,
    FeatureFlag,
    PromptString,
    currentAuthStatusAuthed,
    featureFlagProvider,
    isDotCom,
    logDebug,
    modelsService,
} from '@sourcegraph/cody-shared'
import type { ChatModel } from '../chat/chat-view/ChatModel'
import { type ContextRetriever, toStructuredMentions } from '../chat/chat-view/ContextRetriever'
import { DefaultPrompter } from '../chat/chat-view/prompt'
import { getCodebaseContextItemsForEditorState } from '../chat/clientStateBroadcaster'
import { getContextFileFromWorkspaceFsPath } from '../commands/context/file-path'
import { getContextFileFromShell } from '../commands/context/shell'
import { getCategorizedMentions } from '../prompt-builder/unique-context'

/**
 * This is created for each chat submitted by the user. It is responsible for
 * handling the reflection step and perform additional context retrieval for the chat.
 */
export class CodyReflection {
    private isEnabled = true

    private multiplexer = new BotResponseMultiplexer()
    private authStatus = currentAuthStatusAuthed()

    private responses: Record<string, string> = {
        CODYTOOLCLI: '',
        CODYTOOLFILE: '',
        CODYTOOLSEARCH: '',
    }
    private performedSearch = new Set<string>()

    constructor(
        private readonly chatModel: ChatModel,
        private readonly chatClient: ChatClient,
        private readonly contextRetriever: ContextRetriever,
        private span: Span,
        private currentContext: ContextItem[]
    ) {
        // Only enable Cody Reflection for the known model ID when feature flag is enabled.
        if (isDotCom(this.authStatus)) {
            this.isEnabled = this.chatModel.modelID === 'sourcegraph/cody-reflection'
            this.initializeMultiplexer()
        } else {
            // For enterprise instances, check the feature flag to enable Cody Reflection.
            featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyReflection).then(async enabled => {
                this.isEnabled = enabled
                this.initializeMultiplexer()
            })
        }
    }

    private initializeMultiplexer(): void {
        this.reset()
        this.multiplexer = new BotResponseMultiplexer()
        if (this.isEnabled) {
            for (const key of Object.keys(this.responses)) {
                this.multiplexer.sub(key, {
                    onResponse: async (c: string) => {
                        this.responses[key] += c
                    },
                    onTurnComplete: async () => Promise.resolve(),
                })
            }
        }
    }

    private get hasContextRequest(): boolean {
        return Object.values(this.responses).some(res => res !== '')
    }

    public async getSmartContext(abortSignal: AbortSignal): Promise<ContextItem[]> {
        if (!this.isEnabled) {
            return []
        }

        await this.review(abortSignal)
        const smartContext = this.hasContextRequest ? await this.getContext() : []

        // TODO: Run this in a loop to review the context?
        // If we have retrieved more context from the search query response,
        // run review again to review the new context and get smarter context if available.
        if (smartContext.length && this.responses.CODYTOOLSEARCH) {
            this.currentContext.push(...smartContext)
            await this.review(abortSignal)
            // Only get additional context if there's a new request
            if (this.hasContextRequest) {
                const secondRound = await this.getContext()
                smartContext.push(...secondRound)
            }
        }
        return smartContext
    }

    private async getContext(): Promise<ContextItem[]> {
        const [cliContext, fileContext, searchContext] = await Promise.all([
            this.getCommandContext(),
            this.getFileContext(),
            this.getSearchContext(),
        ])
        return [...cliContext, ...fileContext, ...searchContext]
    }

    private getItems(key: string, tag: string): string[] {
        const content = this.responses[key]
        const regex = new RegExp(`<${tag}>(.+?)</${tag}>`, 'g')
        const matches = content.match(regex) || []

        return matches.map(m => m.replace(new RegExp(`</?${tag}>`, 'g'), '').trim()).filter(Boolean)
    }
    /**
     * Get the output of the commands provided by Cody as context items.
     */
    private async getCommandContext(): Promise<ContextItem[]> {
        const commands = this.getItems('CODYTOOLCLI', 'cmd')
        logDebug('CodyReflection', 'getCommandContext', { verbose: { commands } })
        return commands.length
            ? (await Promise.all(commands.map(cmd => getContextFileFromShell(cmd)))).flat()
            : []
    }
    /**
     * Get the local context items from the current codebase using the file paths requested by Cody.
     */
    private async getFileContext(): Promise<ContextItem[]> {
        const filePaths = this.getItems('CODYTOOLFILE', 'file')
        logDebug('CodyReflection', 'getFileContext', { verbose: { filePaths } })
        return filePaths.length
            ? (await Promise.all(filePaths.map(p => getContextFileFromWorkspaceFsPath(p)))).filter(
                  (i): i is ContextItem => i !== null
              )
            : []
    }
    /**
     * Get the context items from the codebase using the search query provided by Cody.
     */
    private async getSearchContext(): Promise<ContextItem[]> {
        if (!this.contextRetriever || !this.responses.CODYTOOLSEARCH) {
            return []
        }
        // Verify that the query is not a duplicate of a previous search query.
        const query = this.getItems('CODYTOOLSEARCH', 'query')?.[0]?.trim()
        if (!query || this.performedSearch.has(query)) {
            return []
        }
        // Verify that the codebase is available.
        const codebase = await getCodebaseContextItemsForEditorState(!isDotCom(this.authStatus))
        if (!codebase) {
            return []
        }
        this.performedSearch.add(query) // Store the query to avoid duplicate queries.
        const context = await this.contextRetriever.retrieveContext(
            toStructuredMentions([codebase]),
            PromptString.unsafe_fromLLMResponse(query),
            this.span,
            undefined,
            'disabled'
        )
        return context.slice(-20) // Limit the number of new search context items to 20.
    }
    /**
     * Reviews the current context and generates a response using the chat model.
     *
     * This method resets the current state, prepares the prompt using explicit and implicit mentions,
     * and streams the generated response. It handles the streaming process, publishes updates,
     * and notifies when the turn is complete.
     *
     * @param abortSignal - Signal to abort the operation if needed.
     * @returns A promise that resolves when the review process is complete.
     * @private
     */
    private async review(abortSignal: AbortSignal): Promise<void> {
        this.reset()
        const { explicitMentions, implicitMentions } = getCategorizedMentions(this.currentContext)
        const prompter = new DefaultPrompter(explicitMentions, implicitMentions.slice(-20))
        const { prompt } = await prompter.makePrompt(
            this.chatModel,
            this.authStatus.codyApiVersion,
            true
        )
        const params = {
            model: this.chatModel.modelID,
            maxTokensToSample: this.chatModel.contextWindow.output,
            stream: !modelsService.isStreamDisabled(this.chatModel.modelID),
        } as CompletionParameters
        let responseText = ''
        const stream = this.chatClient.chat(prompt, params, abortSignal)
        try {
            for await (const message of stream) {
                if (message.type === 'change') {
                    const text = message.text.slice(responseText.length)
                    responseText += text
                    this.multiplexer.publish(text)
                } else if (message.type === 'complete' || message.type === 'error') {
                    if (message.type === 'error') {
                        throw new Error('Error while streaming')
                    }
                    await this.multiplexer.notifyTurnComplete()
                    logDebug('CodyReflection', 'completed', { verbose: { prompt, responseText } })
                    break
                }
            }
        } catch (error: unknown) {
            await this.multiplexer.notifyTurnComplete()
            logDebug('CodyReflection', `failed: ${error}`, { verbose: { prompt, responseText } })
        }
    }
    /**
     * Resets the responses for reviewed items.
     * NOTE: Do not reset the performed search set to avoid duplicate searches.
     */
    private reset(): void {
        this.responses = {
            CODYTOOLCLI: '',
            CODYTOOLFILE: '',
            CODYTOOLSEARCH: '',
        }
    }
}
