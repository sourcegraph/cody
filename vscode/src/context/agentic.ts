import type { Span } from '@opentelemetry/api'
import {
    BotResponseMultiplexer,
    type ChatClient,
    type CompletionParameters,
    type ContextItem,
    PromptMixin,
    PromptString,
    firstResultFromOperation,
    firstValueFrom,
    logDebug,
    modelsService,
    newPromptMixin,
    pendingOperation,
    ps,
} from '@sourcegraph/cody-shared'
import { isBoolean } from 'lodash'
import { ChatBuilder } from '../chat/chat-view/ChatBuilder'
import { type ContextRetriever, toStructuredMentions } from '../chat/chat-view/ContextRetriever'
import { DefaultPrompter } from '../chat/chat-view/prompt'
import { getCorpusContextItemsForEditorState } from '../chat/initialContext'
import { getContextFromRelativePath } from '../commands/context/file-path'
import { getContextFileFromShell } from '../commands/context/shell'
import { getCategorizedMentions } from '../prompt-builder/utils'

/**
 * This prompt is used by the Cody Reflection model for reviewing current context,
 * with instructions for the LLM on how to request additional context.
 */
const REFLECTION_AGENT_PROMPT = ps`Analyze the provided context and think step-by-step about whether you can answer the question using the available information.

If you need more information to answer the question, use the following action tags:

1. For additional context from the codebase:
   <CODYTOOLSEARCH><query>$SEARCH_QUERY</query></CODYTOOLSEARCH>

2. To see the output of shell commands:
   <CODYTOOLCLI><cmd>$SHELL_COMMAND</cmd></CODYTOOLCLI>

3. To retrieve full content from a file:
   <CODYTOOLFILE><file>$FILEPATH</file></CODYTOOLFILE>

Example:
To get details for GitHub issue #1234, use:
<CODYTOOLCLI><cmd>gh issue view 1234</cmd></CODYTOOLCLI>

Notes:
- Only use the above action tags when you need additional information.
- You can request multiple pieces of information in a single response.
- When replying to a question with a shell command, enclose the command in a Markdown code block.
- If you don't require additional context to answer the question, reply with a single word: "Reviewed".`

/**
 * A CodyReflectionAgent is created for each chat submitted by the user.
 * It is responsible for reviewing the retrieved context,
 * and perform agentic context retrieval for the chat request.
 */
export class CodyReflectionAgent {
    private isEnabled = false
    private readonly actions: CodyActions
    private readonly multiplexer = new BotResponseMultiplexer()
    private responses: Record<string, string>

    constructor(
        private readonly chatBuilder: ChatBuilder,
        private readonly chatClient: ChatClient,
        contextRetriever: ContextRetriever,
        span: Span,
        private currentContext: ContextItem[]
    ) {
        this.actions = new CodyActions(contextRetriever, span)
        this.responses = { CODYTOOLCLI: '', CODYTOOLFILE: '', CODYTOOLSEARCH: '' }
        this.initializeAgent()
    }

    private async initializeAgent(): Promise<void> {
        console.log(this.chatBuilder.selectedModel, 'this.chatBuilder.selectedModel?')
        this.isEnabled = isBoolean(this.chatBuilder.selectedModel?.includes('cody-reflection'))
        if (this.isEnabled) {
            this.initializeMultiplexer()
        }
    }

    private initializeMultiplexer(): void {
        for (const key of Object.keys(this.responses)) {
            this.multiplexer.sub(key, {
                onResponse: async (c: string) => {
                    this.responses[key] += c
                },
                onTurnComplete: async () => Promise.resolve(),
            })
        }
    }

    public async getContext(abortSignal: AbortSignal): Promise<ContextItem[]> {
        if (!this.isEnabled) {
            return []
        }
        const agenticContext = await this.review(abortSignal)
        // TODO: Run this in a loop to review the context?
        // If we have retrieved more context from the search query response,
        // run review again to review the new context and get smarter context if available.
        if (agenticContext.length && this.responses.CODYTOOLSEARCH) {
            this.currentContext.push(...agenticContext)
            agenticContext.push(...(await this.review(abortSignal)))
        }
        logDebug('CodyReflectionAgent', 'agenticContext', { verbose: { agenticContext } })
        return agenticContext
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
    private async review(abortSignal: AbortSignal): Promise<ContextItem[]> {
        this.reset()

        const { explicitMentions, implicitMentions } = getCategorizedMentions(this.currentContext)

        PromptMixin.add(newPromptMixin(REFLECTION_AGENT_PROMPT))

        // Limit the number of implicit mentions to 20 items.
        const prompter = new DefaultPrompter(explicitMentions, implicitMentions.slice(-20))
        const { prompt } = await prompter.makePrompt(this.chatBuilder, 1)

        const model = this.chatBuilder.selectedModel
        const contextWindow = await firstResultFromOperation(
            ChatBuilder.contextWindowForChat(this.chatBuilder)
        )
        const params = { model, maxTokensToSample: contextWindow.output } as CompletionParameters
        if (model && modelsService.isStreamDisabled(model)) {
            params.stream = false
        }

        let responseText = ''

        try {
            for await (const message of this.chatClient.chat(prompt, params, abortSignal)) {
                if (message.type === 'change') {
                    const text = message.text.slice(responseText.length)
                    responseText += text
                    await this.multiplexer.publish(text)
                } else if (message.type === 'complete' || message.type === 'error') {
                    if (message.type === 'error') throw new Error('Error while streaming')
                    await this.multiplexer.notifyTurnComplete()
                    break
                }
            }
        } catch (error: unknown) {
            await this.multiplexer.notifyTurnComplete()
            logDebug('CodyReflectionAgent', `failed: ${error}`, { verbose: { prompt, responseText } })
        }

        return await this.getAgenticContext()
    }

    private async getAgenticContext(): Promise<ContextItem[]> {
        const [cliContext, fileContext, searchContext] = await Promise.all([
            this.actions.cli(this.getItems('CODYTOOLCLI', 'cmd')),
            this.actions.file(this.getItems('CODYTOOLFILE', 'file')),
            this.actions.search(this.getItems('CODYTOOLSEARCH', 'query')),
        ])
        return [...cliContext, ...fileContext, ...searchContext]
    }

    private getItems(key: string, tag: string): string[] {
        const content = this.responses[key]?.trim()
        // NOTE: Some LLMs would return <tag>...</tag> instead of <tag>...</tag>.
        const regex = new RegExp(`<${tag}>(.+?)</?${tag}>`, 'g')
        const matches = content.match(regex) || []
        return matches.map(m => m.replace(new RegExp(`</?${tag}>`, 'g'), '').trim()).filter(Boolean)
    }

    private reset(): void {
        this.responses = { CODYTOOLCLI: '', CODYTOOLFILE: '', CODYTOOLSEARCH: '' }
    }
}

class CodyActions {
    constructor(
        private readonly contextRetriever: ContextRetriever,
        private readonly span: Span
    ) {}

    private performedSearch = new Set<string>()

    /**
     * Get the context items from the codebase using the search query provided by Cody.
     */
    async search(queries: string[]): Promise<ContextItem[]> {
        const query = queries[0] // There should only be one query.
        if (!this.contextRetriever || !query || this.performedSearch.has(query)) {
            return []
        }
        // Get the latest corpus context items
        const corpusItems = await firstValueFrom(getCorpusContextItemsForEditorState())
        if (corpusItems === pendingOperation || corpusItems.length === 0) {
            return []
        }
        // Find the first item that represents a repository
        const repo = corpusItems.find(i => i.type === 'tree' || i.type === 'repository')
        if (!repo) {
            return []
        }
        const context = await this.contextRetriever.retrieveContext(
            toStructuredMentions([repo]),
            PromptString.unsafe_fromLLMResponse(query),
            this.span
        )
        // Store the search query to avoid running the same query again.
        this.performedSearch.add(query)
        // Limit the number of the new context items to 20 items to avoid long processing time
        // during the next reflection process.
        return context.slice(-20)
    }

    /**
     * Get the local context items from the current codebase using the file paths requested by Cody.
     */
    async file(filePaths: string[]): Promise<ContextItem[]> {
        return Promise.all(filePaths.map(getContextFromRelativePath)).then(results =>
            results.filter((item): item is ContextItem => item !== null)
        )
    }

    /**
     * Get the output of the commands provided by Cody as context items.
     */
    async cli(commands: string[]): Promise<ContextItem[]> {
        return Promise.all(commands.map(getContextFileFromShell)).then(results => results.flat())
    }
}
