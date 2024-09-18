import type { Span } from '@opentelemetry/api'
import {
    BotResponseMultiplexer,
    type ChatClient,
    type CompletionParameters,
    type ContextItem,
    PromptString,
    currentAuthStatusAuthed,
    isDotCom,
    modelsService,
} from '@sourcegraph/cody-shared'
import { getContextFileFromWorkspaceFsPath } from '../../commands/context/file-path'
import { getContextFileFromShell } from '../../commands/context/shell'
import type { ChatModel } from '../chat-view/ChatModel'
import { type ContextRetriever, toStructuredMentions } from '../chat-view/ContextRetriever'
import type { DefaultPrompter } from '../chat-view/prompt'
import { getCorpusContextItemsForEditorState } from '../clientStateBroadcaster'

export class ContextReviewer {
    private responses: Record<string, string> = {
        CODYTOOLCLI: '',
        CODYTOOLFILE: '',
        CODYTOOLSEARCH: '',
    }
    private multiplexer: BotResponseMultiplexer

    constructor(
        private readonly chatModel: ChatModel,
        private readonly apiVersion: number,
        private readonly prompter: DefaultPrompter,
        private readonly chatClient: ChatClient,
        private readonly contextRetriever: ContextRetriever,
        private span: Span
    ) {
        this.multiplexer = new BotResponseMultiplexer()
        this.initializeMultiplexer()
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

    private hasContextRequest(): boolean {
        return Object.values(this.responses).some(response => response !== '')
    }

    public async tryAddSmartContext(abortSignal: AbortSignal): Promise<ContextItem[]> {
        const lastHumanMsg = this.chatModel.getLastHumanMessage()
        const currentContext = lastHumanMsg?.contextFiles ?? []

        await this.stream(abortSignal)
        const smartContext = await this.getContext()
        if (!this.hasContextRequest()) {
            return smartContext
        }
        // TODO: Run this in a loop to review the context
        if (smartContext.length && this.responses.CODYTOOLSEARCH) {
            currentContext.push(...smartContext)
            this.chatModel.setLastMessageContext(currentContext, lastHumanMsg?.contextAlternatives)
            await this.stream(abortSignal)
            if (this.hasContextRequest()) {
                const secondRound = await this.getContext()
                this.prompter.addSmartContextItem(secondRound)
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
        return this.responses[key].replaceAll(`</${tag}>`, '').split(`<${tag}>`).slice(1)
    }

    private async getCommandContext(): Promise<ContextItem[]> {
        const commands = this.getItems('CODYTOOLCLI', 'cmd')
        return (await Promise.all(commands.map(cmd => getContextFileFromShell(cmd.trim())))).flat()
    }

    private async getFileContext(): Promise<ContextItem[]> {
        const fsPaths = this.getItems('CODYTOOLFILE', 'file')
        return (
            await Promise.all(fsPaths.map(path => getContextFileFromWorkspaceFsPath(path.trim())))
        ).filter((item): item is ContextItem => item !== null)
    }

    private async getSearchContext(): Promise<ContextItem[]> {
        if (!this.contextRetriever || !this.responses.CODYTOOLSEARCH) {
            return []
        }
        const queries = this.getItems('CODYTOOLSEARCH', 'query')
        const useRemote = !isDotCom(currentAuthStatusAuthed().endpoint)
        const codebase = await getCorpusContextItemsForEditorState(useRemote)
        const structuredMentions = toStructuredMentions(codebase)
        return (
            await Promise.all(
                queries.map(query =>
                    this.contextRetriever.retrieveContext(
                        structuredMentions,
                        PromptString.unsafe_fromLLMResponse(query),
                        this.span
                    )
                )
            )
        ).flat()
    }

    private async stream(abortSignal: AbortSignal): Promise<void> {
        this.reset()

        const { prompt } = await this.prompter.makePrompt(this.chatModel, this.apiVersion, true)

        const params = {
            model: this.chatModel.modelID,
            maxTokensToSample: this.chatModel.contextWindow.output,
            stream: !modelsService.isStreamDisabled(this.chatModel.modelID),
        } as CompletionParameters

        const stream = this.chatClient.chat(prompt, params, abortSignal)
        let streamed = 0

        try {
            for await (const message of stream) {
                if (message.type === 'change') {
                    const text = message.text.slice(streamed)
                    streamed += text.length
                    this.publish(text)
                } else if (message.type === 'complete' || message.type === 'error') {
                    await this.notifyTurnComplete()
                    break
                }
            }
        } catch (error: unknown) {
            await this.notifyTurnComplete()
        }
    }

    private publish(text: string): void {
        this.multiplexer.publish(text)
    }

    private async notifyTurnComplete(): Promise<void> {
        await this.multiplexer.notifyTurnComplete()
    }

    private reset(): void {
        this.responses = {
            CODYTOOLCLI: '',
            CODYTOOLFILE: '',
            CODYTOOLSEARCH: '',
        }
    }
}
