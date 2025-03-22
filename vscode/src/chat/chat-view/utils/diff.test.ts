import { testFileUri } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import { diffWithLineNum, getFileDiff } from './diff'

describe('diffWithLineNum', () => {
    it('should generate markdown diff for added content', () => {
        const oldText = 'First line'
        const newText = 'First line\nSecond line'

        const result = diffWithLineNum(oldText, newText)

        expect(result).toContain('```diff')
        expect(result).toContain(' First line')
        expect(result).toContain('+ Second line')
        expect(result).toContain('```')
    })

    it('should generate markdown diff for removed content', () => {
        const oldText = 'First line\nSecond line'
        const newText = 'First line'

        const result = diffWithLineNum(oldText, newText)

        expect(result).toContain('```diff')
        expect(result).toContain(' First line')
        expect(result).toContain('- Second line')
        expect(result).toContain('```')
    })

    it('should generate markdown diff for modified content', () => {
        const oldText = 'First line\nSecond line\nThird line'
        const newText = 'First line\nModified line\nThird line'

        const result = diffWithLineNum(oldText, newText)

        expect(result).toContain('```diff')
        expect(result).toContain('  First line')
        expect(result).toContain('- Second line')
        expect(result).toContain('+ Modified line')
        expect(result).toContain('  Third line')
        expect(result).toContain('```')
    })

    it('should handle empty string inputs', () => {
        expect(diffWithLineNum('', '')).toBe('```diff\n// No changes detected\n```')
    })

    it('should match snapshot for complex diff', () => {
        const oldText = 'Header line\nFirst paragraph\nSecond paragraph\nFooter line'
        const newText =
            'Header line\nFirst paragraph with changes\nNew paragraph\nSecond paragraph\nFooter line with edits'

        expect(diffWithLineNum(oldText, newText)).toMatchSnapshot()
    })

    it('should match snapshot for complex diff', () => {
        const oldText = 'Header line\nFirst paragraph\nSecond paragraph\nFooter line'
        const newText =
            'Header line\nFirst paragraph with changes\nNew paragraph\nSecond paragraph\nFooter line with edits'

        expect(diffWithLineNum(oldText, newText)).toMatchSnapshot()
    })

    it('should match snapshot for complex diff with line numbers', () => {
        const oldText = 'Header line\n\n\nFirst paragraph\nSecond paragraph\n\nFooter line'
        const newText =
            'Header line\n\n\nFirst paragraph with changes\n\nNew paragraph\nSecond paragraph\nFooter line with edits'

        const result = diffWithLineNum(oldText, newText)
        // Save the result as a snapshot and compare with it on future test runs
        expect(result).toMatchSnapshot()
    })

    it('should match snapshot for complex diff with line changed - 1', () => {
        const oldText = 'Header line\n\n\nFirst paragraph\nSecond paragraph\n\nFooter line\n\n'
        const newText =
            'Header line\n\n\nFirst paragraph with changes\n\nNew paragraph\nSecond paragraph\nFooter line with edits\n\n'

        const result = diffWithLineNum(oldText, newText)
        // Save the result as a snapshot and compare with it on future test runs
        expect(result).toMatchSnapshot()
    })

    it('should match snapshot for complex diff with line changed with empty lines changed', () => {
        const oldText = `async function deleteEditHistoryItem(
      uri: vscode.Uri,
      content: string,
      timestamp?: string
  ): Promise<string> {
      // Remove the history item after reverting
      historyStore.delete(uri.toString())
      // Update the source control panel display
      updateEditHistoryGroup()
      const contentBuffer = new TextEncoder().encode(content)
      await vscode.workspace.fs.writeFile(uri, contentBuffer)
      const msg = 'Edit history item deleted'
      vscode.window.showInformationMessage(msg)
      return msg
  }`

        const newText = `async function deleteEditHistoryItem(
      uri: vscode.Uri,
      content: string,
      timestamp?: string
  ): Promise<string> {
      // Remove the history item after reverting
      historyStore.delete(uri.toString())

      // Update the source control panel display
      updateEditHistoryGroup()

      const contentBuffer = new TextEncoder().encode(content)
      await vscode.workspace.fs.writeFile(uri, contentBuffer)
      return 'Reverted changes to ' + displayPath(uri)
  }
  `
        const result = diffWithLineNum(oldText, newText)
        // Save the result as a snapshot and compare with it on future test runs
        expect(result).toMatchSnapshot()
    })

    it('should match snapshot for complex diff with non-empty line changed', () => {
        const oldText = `import findLast from 'lodash/findLast'\n\nimport {\n    type ChatMessage,\n    type ChatModel,\n    type ContextItem,\n    type ModelContextWindow,\n    type ProcessingStep,\n    type RankedContext,\n    type SerializedChatInteraction,\n    type SerializedChatTranscript,\n    distinctUntilChanged,\n    errorToChatError,\n    modelsService,\n    pendingOperation,\n    ps,\n    serializeChatMessage,\n    startWith,\n    switchMap,\n    toRangeData,\n} from '@sourcegraph/cody-shared'\n\nimport { Observable, Subject, map } from 'observable-fns'\nimport { getChatPanelTitle } from './chat-helpers'\n\n/**\n * A builder for a chat thread. This is the canonical way to construct and mutate a chat thread.\n */\nexport class ChatBuilder {\n    /**\n     * Observe the context window for the {@link chat} thread's model (or the default chat model if\n     * it has none).\n     */\n    public static contextWindowForChat(\n        chat: ChatBuilder | Observable<ChatBuilder>\n    ): Observable<ModelContextWindow | Error | typeof pendingOperation> {\n        return ChatBuilder.resolvedModelForChat(chat).pipe(\n            switchMap(\n                (model): Observable<ModelContextWindow | Error | typeof pendingOperation> =>\n                    model === pendingOperation\n                        ? Observable.of(pendingOperation)\n                        : model\n                          ? modelsService.observeContextWindowByID(model)\n                          : Observable.of(\n                                new Error('No chat model is set, and no default chat model is available')\n                            )\n            )\n        )\n    }\n\n    /**\n     * Observe the resolved model for the {@link chat}, which is its selected model, or else the\n     * default chat model if it has no selected model.\n     */\n    public static resolvedModelForChat(\n        chat: ChatBuilder | Observable<ChatBuilder>\n    ): Observable<ChatModel | undefined | typeof pendingOperation> {\n        return (chat instanceof Observable ? chat : chat.changes).pipe(\n            map(chat => chat.selectedModel),\n            distinctUntilChanged(),\n            switchMap(selectedModel =>\n                selectedModel\n                    ? modelsService.isModelAvailable(selectedModel).pipe(\n                          switchMap(isModelAvailable => {\n                              // Confirm that the user's explicitly selected model is available on the endpoint.\n                              if (isModelAvailable) {\n                                  return Observable.of(selectedModel)\n                              }\n\n                              // If the user's explicitly selected model is not available on the\n                              // endpoint, clear it and use the default going forward. This should\n                              // only happen if the server's model selection changes or if the user\n                              // switches accounts with an open chat. Perhaps we could show some\n                              // kind of indication to the user, but this is fine for now.\n                              if (chat instanceof ChatBuilder) {\n                                  chat.setSelectedModel(undefined)\n                              }\n                              return modelsService.getDefaultChatModel()\n                          })\n                      )\n                    : modelsService.getDefaultChatModel()\n            )\n        )\n    }\n\n    private changeNotifications = new Subject<void>()\n    constructor(\n        /**\n         * The model ID to use for the next assistant response if the user has explicitly chosen\n         * one, or else \`undefined\` to use the default chat model on the current endpoint at the\n         * time the chat is sent.\n         */\n        public selectedModel?: ChatModel | undefined,\n\n        public readonly sessionID: string = new Date(Date.now()).toUTCString(),\n        private messages: ChatMessage[] = [],\n        private customChatTitle?: string\n    ) {}\n\n    /** An observable that emits whenever the {@link ChatBuilder}'s chat changes. */\n    public changes: Observable<ChatBuilder> = this.changeNotifications.pipe(\n        startWith(undefined),\n        map(() => this)\n    )\n\n    /**\n     * Set the selected model to use for the next assistant response, or \`undefined\` to use the\n     * default chat model.\n     */\n    public setSelectedModel(newModelID: ChatModel | undefined): void {\n        this.selectedModel = newModelID\n        this.changeNotifications.next()\n    }\n\n    public isEmpty(): boolean {\n        return this.messages.length === 0\n    }\n\n    public setLastMessageIntent(intent: ChatMessage['intent']): void {\n        const lastMessage = this.messages.at(-1)\n        if (!lastMessage) {\n            throw new Error('no last message')\n        }\n        if (lastMessage.speaker !== 'human') {\n            throw new Error('Cannot set intent for bot message')\n        }\n\n        lastMessage.intent = intent\n\n        this.changeNotifications.next()\n    }\n\n    public setLastMessageContext(\n        newContextUsed: ContextItem[],\n        contextAlternatives?: RankedContext[]\n    ): void {\n        const lastMessage = this.messages.at(-1)\n        if (!lastMessage) {\n            throw new Error('no last message')\n        }\n        if (lastMessage.speaker !== 'human') {\n            throw new Error('Cannot set new context used for bot message')\n        }\n\n        lastMessage.contextFiles = newContextUsed\n        lastMessage.contextAlternatives = contextAlternatives?.map(({ items, strategy }) => {\n            return {\n                items: items,\n                strategy,\n            }\n        })\n\n        this.changeNotifications.next()\n    }\n\n    public addHumanMessage(message: Omit<ChatMessage, 'speaker'>): void {\n        if (this.messages.at(-1)?.speaker === 'human') {\n            throw new Error('Cannot add a user message after a user message')\n        }\n        this.messages.push({ ...message, speaker: 'human' })\n        this.changeNotifications.next()\n    }\n\n    /**\n     * A special sentinel value for {@link ChatBuilder.addBotMessage} for when the assistant message\n     * is not from any model. Only used in edge cases.\n     */\n    public static readonly NO_MODEL = Symbol('noChatModel')\n\n    public addBotMessage(\n        message: Omit<ChatMessage, 'speaker' | 'model' | 'error'>,\n        model: ChatModel | typeof ChatBuilder.NO_MODEL\n    ): void {\n        const lastMessage = this.messages.at(-1)\n        let error: any\n        // If there is no text, it could be a placeholder message for an error\n        if (lastMessage?.speaker === 'assistant') {\n            if (lastMessage?.text) {\n                throw new Error('Cannot add a bot message after a bot message')\n            }\n            error = this.messages.pop()?.error\n        }\n        this.messages.push({\n            model: model === ChatBuilder.NO_MODEL ? undefined : model,\n            ...message,\n            speaker: 'assistant',\n            error,\n        })\n        this.changeNotifications.next()\n    }\n\n    public addSearchResultAsBotMessage(search: ChatMessage['search']): void {\n        const lastMessage = this.messages.at(-1)\n        let error: any\n        // If there is no text, it could be a placeholder message for an error\n        if (lastMessage?.speaker === 'assistant') {\n            if (lastMessage?.text) {\n                throw new Error('Cannot add a bot message after a bot message')\n            }\n            error = this.messages.pop()?.error\n        }\n        this.messages.push({\n            search,\n            speaker: 'assistant',\n            error,\n            text: ps\`Search found {search?.response?.results.results.length || 0} results\`,\n        })\n        this.changeNotifications.next()\n    }\n\n    public addErrorAsBotMessage(error: Error, model: ChatModel | typeof ChatBuilder.NO_MODEL): void {\n        const lastMessage = this.messages.at(-1)\n        // Remove the last assistant message if any\n        const lastAssistantMessage: ChatMessage | undefined =\n            lastMessage?.speaker === 'assistant' ? this.messages.pop() : undefined\n        // Then add a new assistant message with error added\n        this.messages.push({\n            model: model === ChatBuilder.NO_MODEL ? undefined : model,\n            ...(lastAssistantMessage ?? {}),\n            speaker: 'assistant',\n            error: errorToChatError(error),\n        })\n        this.changeNotifications.next()\n    }\n\n    public setLastMessageProcesses(processes: ProcessingStep[]): void {\n        const lastMessage = this.messages.at(-1)\n        if (!lastMessage) {\n            throw new Error('no last message')\n        }\n        if (lastMessage.speaker !== 'human') {\n            throw new Error('Cannot set processes for bot message')\n        }\n        lastMessage.processes = processes\n        this.changeNotifications.next()\n    }\n\n    public getLastHumanMessage(): ChatMessage | undefined {\n        return findLast(this.messages, message => message.speaker === 'human')\n    }\n\n    public getLastSpeakerMessageIndex(speaker: 'human' | 'assistant'): number | undefined {\n        return this.messages.findLastIndex(message => message.speaker === speaker)\n    }\n\n    /**\n     * Removes all messages from the given index when it matches the expected speaker.\n     *\n     * expectedSpeaker must match the speaker of the message at the given index.\n     * This helps ensuring the intented messages are being removed.\n     */\n    public removeMessagesFromIndex(index: number, expectedSpeaker: 'human' | 'assistant'): void {\n        if (this.isEmpty()) {\n            throw new Error('ChatModel.removeMessagesFromIndex: not message to remove')\n        }\n\n        const speakerAtIndex = this.messages.at(index)?.speaker\n        if (speakerAtIndex !== expectedSpeaker) {\n            throw new Error(\n                \`ChatModel.removeMessagesFromIndex: expected {expectedSpeaker}, got {speakerAtIndex}\`\n            )\n        }\n\n        // Removes everything from the index to the last element\n        this.messages.splice(index)\n        this.changeNotifications.next()\n    }\n\n    public updateAssistantMessageAtIndex(index: number, update: Omit<ChatMessage, 'speaker'>): void {\n        const message = this.messages.at(index)\n        if (!message) {\n            throw new Error('invalid index')\n        }\n        if (message.speaker !== 'assistant') {\n            throw new Error('Cannot set selected filters for human message')\n        }\n\n        Object.assign(message, { ...update, speaker: 'assistant' })\n\n        this.changeNotifications.next()\n    }\n\n    public getMessages(): readonly ChatMessage[] {\n        return this.messages\n    }\n\n    // De-hydrate because vscode.Range serializes to \`[start, end]\` in JSON.\n    \/\/ TODO: we should use a different type for \`getMessages\` to make the range hydration explicit.\n    public getDehydratedMessages(): readonly ChatMessage[] {\n        return this.messages.map(prepareChatMessage)\n    }\n\n    public getChatTitle(): string {\n        if (this.customChatTitle) {\n            return this.customChatTitle\n        }\n        const lastHumanMessage = this.getLastHumanMessage()\n        return getChatPanelTitle(lastHumanMessage?.text?.toString() ?? '')\n    }\n\n    public setChatTitle(title: string): void {\n        const firstHumanMessage = this.messages[0]\n        if (firstHumanMessage?.speaker === 'human' && this.messages.length === 1) {\n            this.customChatTitle = title\n            this.changeNotifications.next()\n        }\n    }\n\n    /**\n     * Serializes to the transcript JSON format.\n     */\n    public toSerializedChatTranscript(): SerializedChatTranscript | undefined {\n        const interactions: SerializedChatInteraction[] = []\n        for (let i = 0; i < this.messages.length; i += 2) {\n            const humanMessage = this.messages[i]\n            if (humanMessage.error) {\n                // Ignore chats that have errors, we don't need to serialize them\n                return undefined\n            }\n            const assistantMessage = this.messages.at(i + 1)\n            interactions.push(\n                messageToSerializedChatInteraction(humanMessage, assistantMessage, this.messages)\n            )\n        }\n        const result: SerializedChatTranscript = {\n            id: this.sessionID,\n            chatTitle: this.customChatTitle ?? undefined,\n            lastInteractionTimestamp: this.sessionID,\n            interactions,\n        }\n        return result\n    }\n}\n\nfunction messageToSerializedChatInteraction(\n    humanMessage: ChatMessage,\n    assistantMessage: ChatMessage | undefined,\n    messages: ChatMessage[]\n): SerializedChatInteraction {\n    if (humanMessage?.speaker !== 'human') {\n        throw new Error(\n            \`expected human message, got bot. Messages: {JSON.stringify(messages, null, 2)}\`\n        )\n    }\n\n    if (humanMessage.speaker !== 'human') {\n        throw new Error(\n            \`expected human message to have speaker == 'human', got {\n                humanMessage.speaker\n            }. Messages: {JSON.stringify(messages, null, 2)}\`\n        )\n    }\n    if (assistantMessage && assistantMessage.speaker !== 'assistant') {\n        throw new Error(\n            \`expected bot message to have speaker == 'assistant', got {\n                assistantMessage.speaker\n            }. Messages: {JSON.stringify(messages, null, 2)}\`\n        )\n    }\n\n    return {\n        humanMessage: serializeChatMessage(humanMessage),\n        assistantMessage: assistantMessage ? serializeChatMessage(assistantMessage) : null,\n    }\n}\n\nexport function prepareChatMessage(message: ChatMessage): ChatMessage {\n    return {\n        ...message,\n        contextFiles: message.contextFiles?.map(dehydrateContextItem),\n        contextAlternatives: message.contextAlternatives?.map(({ items, strategy }) => ({\n            strategy,\n            items: items.map(dehydrateContextItem),\n        })),\n    }\n}\n\nfunction dehydrateContextItem(item: ContextItem): ContextItem {\n    return {\n        ...item,\n        // De-hydrate because vscode.Range serializes to \`[start, end]\` in JSON.\n        range: toRangeData(item.range),\n    }\n}\n`

        const newText = `import findLast from 'lodash/findLast'\n\nimport {\n    type ChatMessage,\n    type ChatModel,\n    type ContextItem,\n    type ModelContextWindow,\n    type ProcessingStep,\n    type RankedContext,\n    type SerializedChatInteraction,\n    type SerializedChatTranscript,\n    distinctUntilChanged,\n    errorToChatError,\n    modelsService,\n    pendingOperation,\n    ps,\n    serializeChatMessage,\n    startWith,\n    switchMap,\n    toRangeData,\n} from '@sourcegraph/cody-shared'\n\nimport { Observable, Subject, map } from 'observable-fns'\nimport { getChatPanelTitle } from './chat-helpers'\n\n/**\n * A builder for a chat thread. This is the canonical way to construct and mutate a chat thread.\n */\nexport class ChatBuilder {\n    /**\n     * Observe the context window for the {@link chat} thread's model (or the default chat model if\n     * it has none).\n     */\n    public static contextWindowForChat(\n        chat: ChatBuilder | Observable<ChatBuilder>\n    ): Observable<ModelContextWindow | Error | typeof pendingOperation> {\n        return ChatBuilder.resolvedModelForChat(chat).pipe(\n            switchMap(\n                (model): Observable<ModelContextWindow | Error | typeof pendingOperation> =>\n                    model === pendingOperation\n                        ? Observable.of(pendingOperation)\n                        : model\n                          ? modelsService.observeContextWindowByID(model)\n                          : Observable.of(\n                                new Error('No chat model is set, and no default chat model is available')\n                            )\n            )\n        )\n    }\n\n    /**\n     * Observe the resolved model for the {@link chat}, which is its selected model, or else the\n     * default chat model if it has no selected model.\n     */\n    public static resolvedModelForChat(\n        chat: ChatBuilder | Observable<ChatBuilder>\n    ): Observable<ChatModel | undefined | typeof pendingOperation> {\n        return (chat instanceof Observable ? chat : chat.changes).pipe(\n            map(chat => chat.selectedModel),\n            distinctUntilChanged(),\n            switchMap(selectedModel =>\n                selectedModel\n                    ? modelsService.isModelAvailable(selectedModel).pipe(\n                          switchMap(isModelAvailable => {\n                              // Confirm that the user's explicitly selected model is available on the endpoint.\n                              if (isModelAvailable) {\n                                  return Observable.of(selectedModel)\n                              }\n\n                              // If the user's explicitly selected model is not available on the\n                              // endpoint, clear it and use the default going forward. This should\n                              // only happen if the server's model selection changes or if the user\n                              // switches accounts with an open chat. Perhaps we could show some\n                              // kind of indication to the user, but this is fine for now.\n                              if (chat instanceof ChatBuilder) {\n                                  chat.setSelectedModel(undefined)\n                              }\n                              return modelsService.getDefaultChatModel()\n                          })\n                      )\n                    : modelsService.getDefaultChatModel()\n            )\n        )\n    }\n\n    private changeNotifications = new Subject<void>()\n    constructor(\n        /**\n         * The model ID to use for the next assistant response if the user has explicitly chosen\n         * one, or else \`undefined\` to use the default chat model on the current endpoint at the\n         * time the chat is sent.\n         */\n        public selectedModel?: ChatModel | undefined,\n\n        public readonly sessionID: string = new Date(Date.now()).toUTCString(),\n        private messages: ChatMessage[] = [],\n        private customChatTitle?: string\n    ) {}\n\n    /** An observable that emits whenever the {@link ChatBuilder}'s chat changes. */\n    public changes: Observable<ChatBuilder> = this.changeNotifications.pipe(\n        startWith(undefined),\n        map(() => this)\n    )\n\n    /**\n     * Set the selected model to use for the next assistant response, or \`undefined\` to use the\n     * default chat model.\n     */\n    public setSelectedModel(newModelID: ChatModel | undefined): void {\n        this.selectedModel = newModelID\n        this.changeNotifications.next()\n    }\n\n    public isEmpty(): boolean {\n        return this.messages.length === 0\n    }\n\n    public setLastMessageIntent(intent: ChatMessage['intent']): void {\n        const lastMessage = this.messages.at(-1)\n        if (!lastMessage) {\n            throw new Error('no last message')\n        }\n        if (lastMessage.speaker !== 'human') {\n            throw new Error('Cannot set intent for bot message')\n        }\n\n        lastMessage.intent = intent\n\n        this.changeNotifications.next()\n    }\n\n    public setLastMessageContext(\n        newContextUsed: ContextItem[],\n        contextAlternatives?: RankedContext[]\n    ): void {\n        const lastMessage = this.messages.at(-1)\n        if (!lastMessage) {\n            throw new Error('no last message')\n        }\n        if (lastMessage.speaker !== 'human') {\n            throw new Error('Cannot set new context used for bot message')\n        }\n\n        lastMessage.contextFiles = newContextUsed\n        lastMessage.contextAlternatives = contextAlternatives?.map(({ items, strategy }) => {\n            return {\n                items: items,\n                strategy,\n            }\n        })\n\n        this.changeNotifications.next()\n    }\n\n    public addHumanMessage(message: Omit<ChatMessage, 'speaker'>): void {\n        if (this.messages.at(-1)?.speaker === 'human') {\n            throw new Error('Cannot add a user message after a user message')\n        }\n        this.messages.push({ ...message, speaker: 'human' })\n        this.changeNotifications.next()\n    }\n\n    /**\n     * A special sentinel value for {@link ChatBuilder.addBotMessage} for when the assistant message\n     * is not from any model. Only used in edge cases.\n     */\n    public static readonly NO_MODEL = Symbol('noChatModel')\n\n    public addBotMessage(\n        message: Omit<ChatMessage, 'speaker' | 'model' | 'error'>,\n        model: ChatModel | typeof ChatBuilder.NO_MODEL\n    ): void {\n        const lastMessage = this.messages.at(-1)\n        let error: any\n        // If there is no text, it could be a placeholder message for an error\n        if (lastMessage?.speaker === 'assistant') {\n            if (lastMessage?.text) {\n                throw new Error('Cannot add a bot message after a bot message')\n            }\n            error = this.messages.pop()?.error\n        }\n        this.messages.push({\n            model: model === ChatBuilder.NO_MODEL ? undefined : model,\n            ...message,\n            speaker: 'assistant',\n            error,\n        })\n        this.changeNotifications.next()\n    }\n\n    public addSearchResultAsBotMessage(search: ChatMessage['search']): void {\n        const lastMessage = this.messages.at(-1)\n        let error: any\n        // If there is no text, it could be a placeholder message for an error\n        if (lastMessage?.speaker === 'assistant') {\n            if (lastMessage?.text) {\n                throw new Error('Cannot add a bot message after a bot message')\n            }\n            error = this.messages.pop()?.error\n        }\n        this.messages.push({\n            search,\n            speaker: 'assistant',\n            error,\n            text: ps\`Search found {search?.response?.results.results.length || 0} results\`,\n        })\n        this.changeNotifications.next()\n    }\n\n    public addErrorAsBotMessage(error: Error, model: ChatModel | typeof ChatBuilder.NO_MODEL): void {\n        const lastMessage = this.messages.at(-1)\n        // Remove the last assistant message if any\n        const lastAssistantMessage: ChatMessage | undefined =\n            lastMessage?.speaker === 'assistant' ? this.messages.pop() : undefined\n        // Then add a new assistant message with error added\n        this.messages.push({\n            model: model === ChatBuilder.NO_MODEL ? undefined : model,\n            ...(lastAssistantMessage ?? {}),\n            speaker: 'assistant',\n            error: errorToChatError(error),\n        })\n        this.changeNotifications.next()\n    }\n\n    public setLastMessageProcesses(processes: ProcessingStep[]): void {\n        const lastMessage = this.messages.at(-1)\n        if (!lastMessage) {\n            throw new Error('no last message')\n        }\n        if (lastMessage.speaker !== 'human') {\n            throw new Error('Cannot set processes for bot message')\n        }\n        lastMessage.processes = processes\n        this.changeNotifications.next()\n    }\n\n    public getLastHumanMessage(): ChatMessage | undefined {\n        return findLast(this.messages, message => message.speaker === 'human')\n    }\n\n    public getLastBotMessage(): ChatMessage | undefined {\n        return findLast(this.messages, message => message.speaker === 'assistant')\n    }\n\n    public getLastSpeakerMessageIndex(speaker: 'human' | 'assistant'): number | undefined {\n        return this.messages.findLastIndex(message => message.speaker === speaker)\n    }\n\n    /**\n     * Removes all messages from the given index when it matches the expected speaker.\n     *\n     * expectedSpeaker must match the speaker of the message at the given index.\n     * This helps ensuring the intented messages are being removed.\n     */\n    public removeMessagesFromIndex(index: number, expectedSpeaker: 'human' | 'assistant'): void {\n        if (this.isEmpty()) {\n            throw new Error('ChatModel.removeMessagesFromIndex: not message to remove')\n        }\n\n        const speakerAtIndex = this.messages.at(index)?.speaker\n        if (speakerAtIndex !== expectedSpeaker) {\n            throw new Error(\n                \`ChatModel.removeMessagesFromIndex: expected {expectedSpeaker}, got {speakerAtIndex}\`\n            )\n        }\n\n        // Removes everything from the index to the last element\n        this.messages.splice(index)\n        this.changeNotifications.next()\n    }\n\n    public updateAssistantMessageAtIndex(index: number, update: Omit<ChatMessage, 'speaker'>): void {\n        const message = this.messages.at(index)\n        if (!message) {\n            throw new Error('invalid index')\n        }\n        if (message.speaker !== 'assistant') {\n            throw new Error('Cannot set selected filters for human message')\n        }\n\n        Object.assign(message, { ...update, speaker: 'assistant' })\n\n        this.changeNotifications.next()\n    }\n\n    public getMessages(): readonly ChatMessage[] {\n        return this.messages\n    }\n\n    // De-hydrate because vscode.Range serializes to \`[start, end]\` in JSON.\n    \/\/ TODO: we should use a different type for \`getMessages\` to make the range hydration explicit.\n    public getDehydratedMessages(): readonly ChatMessage[] {\n        return this.messages.map(prepareChatMessage)\n    }\n\n    public getChatTitle(): string {\n        if (this.customChatTitle) {\n            return this.customChatTitle\n        }\n        const lastHumanMessage = this.getLastHumanMessage()\n        return getChatPanelTitle(lastHumanMessage?.text?.toString() ?? '')\n    }\n\n    public setChatTitle(title: string): void {\n        const firstHumanMessage = this.messages[0]\n        if (firstHumanMessage?.speaker === 'human' && this.messages.length === 1) {\n            this.customChatTitle = title\n            this.changeNotifications.next()\n        }\n    }\n\n    /**\n     * Serializes to the transcript JSON format.\n     */\n    public toSerializedChatTranscript(): SerializedChatTranscript | undefined {\n        const interactions: SerializedChatInteraction[] = []\n        for (let i = 0; i < this.messages.length; i += 2) {\n            const humanMessage = this.messages[i]\n            if (humanMessage.error) {\n                // Ignore chats that have errors, we don't need to serialize them\n                return undefined\n            }\n            const assistantMessage = this.messages.at(i + 1)\n            interactions.push(\n                messageToSerializedChatInteraction(humanMessage, assistantMessage, this.messages)\n            )\n        }\n        const result: SerializedChatTranscript = {\n            id: this.sessionID,\n            chatTitle: this.customChatTitle ?? undefined,\n            lastInteractionTimestamp: this.sessionID,\n            interactions,\n        }\n        return result\n    }\n}\n\nfunction messageToSerializedChatInteraction(\n    humanMessage: ChatMessage,\n    assistantMessage: ChatMessage | undefined,\n    messages: ChatMessage[]\n): SerializedChatInteraction {\n    if (humanMessage?.speaker !== 'human') {\n        throw new Error(\n            \`expected human message, got bot. Messages: {JSON.stringify(messages, null, 2)}\`\n        )\n    }\n\n    if (humanMessage.speaker !== 'human') {\n        throw new Error(\n            \`expected human message to have speaker == 'human', got {\n                humanMessage.speaker\n            }. Messages: {JSON.stringify(messages, null, 2)}\`\n        )\n    }\n    if (assistantMessage && assistantMessage.speaker !== 'assistant') {\n        throw new Error(\n            \`expected bot message to have speaker == 'assistant', got {\n                assistantMessage.speaker\n            }. Messages: {JSON.stringify(messages, null, 2)}\`\n        )\n    }\n\n    return {\n        humanMessage: serializeChatMessage(humanMessage),\n        assistantMessage: assistantMessage ? serializeChatMessage(assistantMessage) : null,\n    }\n}\n\nexport function prepareChatMessage(message: ChatMessage): ChatMessage {\n    return {\n        ...message,\n        contextFiles: message.contextFiles?.map(dehydrateContextItem),\n        contextAlternatives: message.contextAlternatives?.map(({ items, strategy }) => ({\n            strategy,\n            items: items.map(dehydrateContextItem),\n        })),\n    }\n}\n\nfunction dehydrateContextItem(item: ContextItem): ContextItem {\n    return {\n        ...item,\n        // De-hydrate because vscode.Range serializes to \`[start, end]\` in JSON.\n        range: toRangeData(item.range),\n    }\n}\n`

        // Save the result as a snapshot and compare with it on future test runs
        expect(diffWithLineNum(oldText, newText)).toMatchSnapshot()
    })
})
describe('getFileDiff', () => {
    it('should generate markdown diff for file changes', () => {
        const oldText = 'First line\nSecond line'
        const newText = 'First line\nModified line'
        const filePath = '/file.ts'
        const uri = testFileUri(filePath)

        const result = getFileDiff(uri, oldText, newText)

        expect(result.changes.length).toEqual(4)
        expect(result.changes.filter(c => c.type === 'unchanged').length).toEqual(2)
        expect(result.changes.filter(c => c.type === 'added').length).toEqual(1)
        expect(result.changes.filter(c => c.type === 'removed').length).toEqual(1)
        expect(result.total.added).toEqual(0)
        expect(result.total.removed).toEqual(0)
        expect(result.total.modified).toEqual(1)
    })

    it('should handle empty file contents', () => {
        const filePath = '/empty.ts'
        const uri = testFileUri(filePath)

        const result = getFileDiff(uri, '', '')

        expect(result.changes.length).toEqual(1)
        expect(result.changes.filter(c => c.type === 'unchanged').length).toEqual(1)
        expect(result.changes.filter(c => c.type === 'added').length).toEqual(0)
        expect(result.changes.filter(c => c.type === 'removed').length).toEqual(0)
        expect(result.total.added).toEqual(0)
        expect(result.total.removed).toEqual(0)
        expect(result.total.modified).toEqual(0)
    })

    it('should handle new files', () => {
        const newText = 'First line\nSecond line'
        const filePath = '/new.ts'
        const uri = testFileUri(filePath)

        const result = getFileDiff(uri, '', newText)

        expect(result.changes.filter(c => c.type === 'unchanged').length).toEqual(1)
        expect(result.changes.filter(c => c.type === 'added').length).toEqual(2)
        expect(result.changes.filter(c => c.type === 'removed').length).toEqual(0)
        expect(result.total.added).toEqual(2)
        expect(result.total.removed).toEqual(0)
        expect(result.total.modified).toEqual(0)
    })

    it('should handle deleted files', () => {
        const oldText = 'First line\nSecond line'
        const filePath = '/deleted.ts'
        const uri = testFileUri(filePath)

        const result = getFileDiff(uri, oldText, '')

        expect(result.changes.filter(c => c.type === 'unchanged').length).toEqual(1)
        expect(result.changes.filter(c => c.type === 'added').length).toEqual(0)
        expect(result.changes.filter(c => c.type === 'removed').length).toEqual(2)
        expect(result.total.added).toEqual(0)
        expect(result.total.removed).toEqual(2)
        expect(result.total.modified).toEqual(0)
    })

    // TODO: (bee) update snapshot to not match uri on windows
    it.skip('should match snapshot for complex file diff', () => {
        const oldText = 'Header line\nFirst paragraph\nSecond paragraph\nFooter line'
        const newText =
            'Header line\nFirst paragraph with changes\nNew paragraph\nSecond paragraph\nFooter line with edits'
        const uri = testFileUri('/complex.md')

        expect(getFileDiff(uri, oldText, newText)).toMatchSnapshot({})
    })
})
