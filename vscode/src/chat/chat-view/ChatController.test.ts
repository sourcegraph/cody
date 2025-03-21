import {
    AUTH_STATUS_FIXTURE_AUTHED,
    CLIENT_CAPABILITIES_FIXTURE,
    type CompletionGeneratorValue,
    FIXTURE_MODEL,
    type Guardrails,
    PromptString,
    errorToChatError,
    graphqlClient,
    mockAuthStatus,
    mockClientCapabilities,
    mockResolvedConfig,
    modelsService,
    ps,
    useFakeTokenCounterUtils,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { beforeAll, beforeEach, describe, expect, it, test, vi } from 'vitest'
import { Uri } from 'vscode'
import { URI } from 'vscode-uri'
import * as featureFlagProviderModule from '../../../../lib/shared/src/experimentation/FeatureFlagProvider'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { ExtensionClient } from '../../extension-client'
import * as githubRepoMetadataModule from '../../repository/githubRepoMetadata'
import { mockLocalStorage } from '../../services/LocalStorageProvider'
import type { ExtensionMessage } from '../protocol'
import { ChatController, type ChatControllerOptions } from './ChatController'
import { manipulateWebviewHTML } from './ChatController'

describe('ChatController', () => {
    beforeAll(() => {
        useFakeTokenCounterUtils()
    })

    const mockChatClient = {
        chat: vi.fn(),
    } satisfies ChatControllerOptions['chatClient']

    const mockContextRetriever = {
        retrieveContext: vi.fn(),
        computeDidYouMean: vi.fn(),
    } satisfies ChatControllerOptions['contextRetriever']

    const mockEditor: VSCodeEditor = {} as any
    const mockExtensionClient: Pick<ExtensionClient, 'capabilities'> = {
        capabilities: {},
    }
    const mockGuardrails: Guardrails = {} as any

    vi.spyOn(featureFlagProviderModule.featureFlagProvider, 'evaluateFeatureFlag').mockReturnValue(
        Observable.of(true)
    )

    vi.spyOn(
        githubRepoMetadataModule,
        'publicRepoMetadataIfAllWorkspaceReposArePublic',
        'get'
    ).mockReturnValue(Observable.of({ isPublic: false, repoMetadata: undefined }))

    vi.spyOn(graphqlClient, 'getSiteVersion').mockResolvedValue('1.2.3')
    vi.spyOn(graphqlClient, 'viewerSettings').mockResolvedValue({})

    const mockNowDate = new Date(123456)

    let chatController: ChatController
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)
        mockResolvedConfig({
            auth: { serverEndpoint: AUTH_STATUS_FIXTURE_AUTHED.endpoint },
        })
        mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)
        mockLocalStorage()
        vi.setSystemTime(mockNowDate)

        vi.spyOn(modelsService, 'getDefaultModel').mockReturnValue(Observable.of(FIXTURE_MODEL))

        chatController = new ChatController({
            extensionUri: URI.file('x'),
            chatClient: mockChatClient,
            editor: mockEditor,
            extensionClient: mockExtensionClient,
            guardrails: mockGuardrails,
            contextRetriever: mockContextRetriever,
        })
    })

    test('does not create new chat builder when current one is empty during abort', async () => {
        // Setup spies
        const addBotMessageSpy = vi
            .spyOn(chatController as any, 'addBotMessage')
            .mockImplementation(() => {})
        const postMessageSpy = vi
            .spyOn(chatController as any, 'postMessage')
            .mockImplementation(() => {})

        // Create a spy on the isEmpty method to confirm it's called
        const isEmptySpy = vi.fn().mockReturnValue(true)
        vi.spyOn(chatController as any, 'chatBuilder', 'get').mockReturnValue({
            isEmpty: isEmptySpy,
            selectedModel: FIXTURE_MODEL.id,
        })

        // Call the method that would potentially create a new ChatBuilder
        chatController.clearAndRestartSession()

        expect(postMessageSpy).not.toHaveBeenCalled()

        // Verify isEmpty was called
        expect(isEmptySpy).toHaveBeenCalled()

        // Verify that postViewTranscript was not called since we're not creating a new builder
        expect(addBotMessageSpy).not.toHaveBeenCalled()

        // Test the abort scenario
        const abortController = new AbortController()

        // Start a chat message then abort it
        const chatPromise = chatController.handleUserMessage({
            requestID: '1',
            inputText: ps`Test input`,
            mentions: [],
            editorState: null,
            signal: abortController.signal,
            source: 'chat',
        })

        // Abort the request
        abortController.abort()

        // Wait for all promises to settle
        await chatPromise.catch(() => {}) // Ignore the abort error

        expect(chatController.isEmpty()).toBe(true)

        await vi.runOnlyPendingTimersAsync()

        // Verify the abort signal is set
        expect(abortController.signal.aborted).toBe(true)

        // Expect not to add bot message as the chat session has been reset and aborted.
        expect(addBotMessageSpy).not.toHaveBeenCalled()

        // Verify the view transcript was called to update UI after abort
        expect(postMessageSpy).toHaveBeenCalledOnce()
    })

    test('verifies interactionId is passed through chat requests', async () => {
        const mockRequestID = '0'
        mockContextRetriever.retrieveContext.mockResolvedValue([])

        await chatController.handleUserMessage({
            requestID: mockRequestID,
            inputText: ps`Test input`,
            mentions: [],
            editorState: null,
            signal: new AbortController().signal,
            source: 'chat',
        })
        await vi.runOnlyPendingTimersAsync()

        expect(mockChatClient.chat).toHaveBeenCalledWith(
            expect.any(Array),
            expect.any(Object),
            expect.any(AbortSignal),
            mockRequestID
        )
    }, 1500)

    test('send, followup, and edit', { timeout: 1500 }, async () => {
        const postMessageSpy = vi
            .spyOn(chatController as any, 'postMessage')
            .mockImplementation(() => {})
        const addBotMessageSpy = vi.spyOn(chatController as any, 'addBotMessage')

        mockContextRetriever.retrieveContext.mockResolvedValue([])

        // Send the first message in a new chat.
        await chatController.handleUserMessage({
            requestID: '1',
            inputText: PromptString.unsafe_fromUserQuery('Test input'),
            mentions: [],
            editorState: null,
            signal: new AbortController().signal,
            source: 'chat',
        })
        expect(postMessageSpy.mock.calls.at(-1)?.[0]).toStrictEqual<
            Extract<ExtensionMessage, { type: 'transcript' }>
        >({
            type: 'transcript',
            isMessageInProgress: true,
            chatID: mockNowDate.toUTCString(),
            messages: [
                {
                    agent: undefined,
                    content: undefined,
                    speaker: 'human',
                    text: 'Test input',
                    intent: undefined,
                    manuallySelectedIntent: undefined,
                    didYouMeanQuery: undefined,
                    model: undefined,
                    search: undefined,
                    error: undefined,
                    editorState: null,
                    contextFiles: [],
                    processes: undefined,
                    subMessages: undefined,
                },
                {
                    agent: undefined,
                    content: undefined,
                    speaker: 'assistant',
                    model: 'my-model',
                    intent: undefined,
                    manuallySelectedIntent: undefined,
                    didYouMeanQuery: undefined,
                    search: undefined,
                    error: undefined,
                    editorState: undefined,
                    text: undefined,
                    contextFiles: undefined,
                    processes: undefined,
                    subMessages: undefined,
                },
            ],
        })

        mockChatClient.chat.mockReturnValue(
            (async function* () {
                yield { type: 'change', text: 'Test reply 1' }
                yield { type: 'complete', text: 'Test reply 1' }
            })() satisfies AsyncGenerator<CompletionGeneratorValue>
        )

        // Make sure it was sent and the reply was received.
        await vi.runOnlyPendingTimersAsync()

        // Called once for the message.
        // Chat title call is skipped due to input text less than 20 characters.
        expect(mockChatClient.chat).toHaveBeenCalledTimes(1)

        // Create a snapshot of the custom title call
        expect(mockChatClient.chat.mock.calls[0][0]).toMatchInlineSnapshot(`
          [
            {
              "speaker": "human",
              "text": "You are Cody, an AI coding assistant from Sourcegraph.If your answer contains fenced code blocks in Markdown, include the relevant full file path in the code block tag using this structure: \`\`\`$LANGUAGE:$FILEPATH\`\`\`
          For executable terminal commands: enclose each command in individual "bash" language code block without comments and new lines inside.",
            },
            {
              "speaker": "assistant",
              "text": "I am Cody, an AI coding assistant from Sourcegraph.",
            },
            {
              "agent": undefined,
              "contextAlternatives": undefined,
              "contextFiles": undefined,
              "editorState": null,
              "intent": undefined,
              "speaker": "human",
              "text": "Test input",
            },
          ]
        `)

        expect(postMessageSpy.mock.calls[1]?.at(0)).toMatchInlineSnapshot(
            {},
            `
          {
            "chatID": "Thu, 01 Jan 1970 00:02:03 GMT",
            "isMessageInProgress": true,
            "messages": [
              {
                "agent": undefined,
                "content": undefined,
                "contextFiles": undefined,
                "didYouMeanQuery": undefined,
                "editorState": null,
                "error": undefined,
                "intent": undefined,
                "manuallySelectedIntent": undefined,
                "model": undefined,
                "processes": undefined,
                "search": undefined,
                "speaker": "human",
                "subMessages": undefined,
                "text": "Test input",
              },
              {
                "agent": undefined,
                "content": undefined,
                "contextFiles": undefined,
                "didYouMeanQuery": undefined,
                "editorState": undefined,
                "error": undefined,
                "intent": undefined,
                "manuallySelectedIntent": undefined,
                "model": undefined,
                "processes": undefined,
                "search": undefined,
                "speaker": "assistant",
                "subMessages": undefined,
                "text": undefined,
              },
            ],
            "type": "transcript",
          }
        `
        )

        // Send a followup.
        // vi.clearAllMocks()
        mockChatClient.chat.mockReturnValue(
            (async function* () {
                yield { type: 'change', text: 'Test reply 2' }
                yield { type: 'complete', text: 'Test reply 2' }
            })() satisfies AsyncGenerator<CompletionGeneratorValue>
        )

        await chatController.handleUserMessage({
            requestID: '2',
            inputText: PromptString.unsafe_fromUserQuery('Test followup'),
            mentions: [],
            editorState: null,
            signal: new AbortController().signal,
            source: 'chat',
        })

        await vi.runOnlyPendingTimersAsync()

        expect(mockChatClient.chat).toBeCalledTimes(2)
        expect(addBotMessageSpy).toBeCalled()

        expect(postMessageSpy.mock.calls.at(-1)?.at(0)).toStrictEqual<
            Extract<ExtensionMessage, { type: 'transcript' }>
        >({
            type: 'transcript',
            isMessageInProgress: false,
            chatID: mockNowDate.toUTCString(),
            messages: [
                {
                    agent: undefined,
                    content: undefined,
                    speaker: 'human',
                    text: 'Test input',
                    intent: undefined,
                    manuallySelectedIntent: undefined,
                    didYouMeanQuery: undefined,
                    model: undefined,
                    error: undefined,
                    search: undefined,
                    editorState: null,
                    contextFiles: [],
                    processes: undefined,
                    subMessages: undefined,
                },
                {
                    agent: undefined,
                    content: undefined,
                    speaker: 'assistant',
                    model: 'my-model',
                    intent: undefined,
                    manuallySelectedIntent: undefined,
                    didYouMeanQuery: undefined,
                    error: undefined,
                    editorState: undefined,
                    text: 'Test reply 1',
                    search: undefined,
                    contextFiles: undefined,
                    processes: undefined,
                    subMessages: undefined,
                },
                {
                    agent: undefined,
                    content: undefined,
                    speaker: 'human',
                    text: 'Test followup',
                    intent: undefined,
                    manuallySelectedIntent: undefined,
                    didYouMeanQuery: undefined,
                    model: undefined,
                    search: undefined,
                    error: undefined,
                    editorState: null,
                    contextFiles: [],
                    processes: undefined,
                    subMessages: undefined,
                },
                {
                    agent: undefined,
                    content: undefined,
                    speaker: 'assistant',
                    model: 'my-model',
                    intent: undefined,
                    manuallySelectedIntent: undefined,
                    didYouMeanQuery: undefined,
                    error: undefined,
                    editorState: undefined,
                    text: 'Test reply 2',
                    contextFiles: undefined,
                    search: undefined,
                    processes: undefined,
                    subMessages: undefined,
                },
            ],
        })

        // Now try editing the message.
        vi.clearAllMocks()
        mockChatClient.chat.mockReturnValue(
            (async function* () {
                yield { type: 'change', text: 'Test reply 3' }
                yield { type: 'complete', text: 'Test reply 3' }
            })() satisfies AsyncGenerator<CompletionGeneratorValue>
        )
        await chatController.handleEdit({
            requestID: '3',
            index: 2,
            text: PromptString.unsafe_fromUserQuery('Test edit'),
            contextFiles: [],
            editorState: null,
        })
        await vi.runOnlyPendingTimersAsync()
        expect(mockChatClient.chat).toBeCalledTimes(1)
        expect(addBotMessageSpy).toHaveBeenCalled()
        expect(postMessageSpy.mock.calls.at(4)?.at(0)).toStrictEqual<
            Extract<ExtensionMessage, { type: 'transcript' }>
        >({
            type: 'transcript',
            isMessageInProgress: true,
            chatID: mockNowDate.toUTCString(),
            messages: [
                {
                    agent: undefined,
                    content: undefined,
                    speaker: 'human',
                    text: 'Test input',
                    intent: undefined,
                    manuallySelectedIntent: undefined,
                    didYouMeanQuery: undefined,
                    model: undefined,
                    error: undefined,
                    search: undefined,
                    editorState: null,
                    contextFiles: [],
                    processes: undefined,
                    subMessages: undefined,
                },
                {
                    agent: undefined,
                    content: undefined,
                    speaker: 'assistant',
                    model: 'my-model',
                    intent: undefined,
                    manuallySelectedIntent: undefined,
                    didYouMeanQuery: undefined,
                    error: undefined,
                    editorState: undefined,
                    text: 'Test reply 1',
                    search: undefined,
                    contextFiles: undefined,
                    processes: undefined,
                    subMessages: undefined,
                },
                {
                    agent: undefined,
                    content: undefined,
                    speaker: 'human',
                    text: 'Test edit',
                    intent: undefined,
                    manuallySelectedIntent: undefined,
                    didYouMeanQuery: undefined,
                    search: undefined,
                    model: undefined,
                    error: undefined,
                    editorState: null,
                    contextFiles: [],
                    processes: undefined,
                    subMessages: undefined,
                },
                {
                    agent: undefined,
                    content: undefined,
                    speaker: 'assistant',
                    model: 'my-model',
                    intent: undefined,
                    manuallySelectedIntent: undefined,
                    didYouMeanQuery: undefined,
                    search: undefined,
                    error: undefined,
                    editorState: undefined,
                    text: 'Test reply 3',
                    contextFiles: undefined,
                    processes: undefined,
                    subMessages: undefined,
                },
            ],
        })
    })

    test.skip('send error', async () => {
        const postMessageSpy = vi
            .spyOn(chatController as any, 'postMessage')
            .mockImplementation(() => {})
        const addBotMessageSpy = vi.spyOn(chatController as any, 'addBotMessage')

        mockChatClient.chat.mockReturnValue(
            (async function* () {
                yield { type: 'change', text: 'Test partial reply' }
                yield { type: 'error', error: new Error('my-error') }
            })() satisfies AsyncGenerator<CompletionGeneratorValue>
        )
        mockContextRetriever.retrieveContext.mockResolvedValue([])

        // Send the first message in a new chat.
        await chatController.handleUserMessage({
            requestID: '1',
            inputText: PromptString.unsafe_fromUserQuery('Test input'),
            mentions: [],
            editorState: null,
            signal: new AbortController().signal,
            source: 'chat',
        })
        await vi.runOnlyPendingTimersAsync()
        expect(mockChatClient.chat).toBeCalledTimes(1)
        expect(addBotMessageSpy).toHaveBeenCalledWith('1', ps`Test partial reply`, undefined, 'my-model')
        expect(postMessageSpy.mock.calls.at(9)?.at(0)).toStrictEqual<
            Extract<ExtensionMessage, { type: 'transcript' }>
        >({
            type: 'transcript',
            isMessageInProgress: false,
            chatID: mockNowDate.toUTCString(),
            messages: [
                {
                    agent: undefined,
                    speaker: 'human',
                    text: 'Test input',
                    model: undefined,
                    error: undefined,
                    editorState: null,
                    contextFiles: [],
                    intent: undefined,
                    manuallySelectedIntent: undefined,
                    didYouMeanQuery: undefined,
                    search: undefined,
                    processes: undefined,
                    subMessages: undefined,
                },
                {
                    agent: undefined,
                    speaker: 'assistant',
                    model: FIXTURE_MODEL.id,
                    error: errorToChatError(new Error('my-error')),
                    intent: undefined,
                    manuallySelectedIntent: undefined,
                    didYouMeanQuery: undefined,
                    editorState: undefined,
                    text: 'Test partial reply',
                    contextFiles: undefined,
                    search: undefined,
                    processes: undefined,
                    subMessages: undefined,
                },
            ],
        })
    })
})

describe('manipulateWebviewHTML', () => {
    const options = {
        cspSource: 'self',
    }
    it('replaces relative paths with resource paths', () => {
        const html = '<img src="./image.png">'
        const result = manipulateWebviewHTML(html, {
            ...options,
            resources: Uri.parse('https://example.com/resources'),
        })
        expect(result).toBe('<img src="https://example.com/resources/image.png">')
    })

    it('injects script and removes CSP when injectScript is provided', () => {
        const html =
            '<!-- START CSP --><meta http-equiv="Content-Security-Policy" content="default-src \'none\';"><!-- END CSP --><script>/*injectedScript*/</script>'
        const result = manipulateWebviewHTML(html, {
            ...options,
            injectScript: 'console.log("Injected script")',
        })
        expect(result).not.toContain('Content-Security-Policy')
        expect(result).toContain('console.log("Injected script")')
    })

    it('injects style and removes CSP when injectStyle is provided', () => {
        const html =
            '<!-- START CSP --><meta http-equiv="Content-Security-Policy" content="default-src \'none\';"><!-- END CSP --><style>/*injectedStyle*/</style>'
        const result = manipulateWebviewHTML(html, {
            ...options,
            injectStyle: 'body { background: red; }',
        })
        expect(result).not.toContain('Content-Security-Policy')
        expect(result).toContain('body { background: red; }')
    })

    it('updates CSP source when no injection is provided', () => {
        const html =
            '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' {cspSource};">'
        const result = manipulateWebviewHTML(html, {
            ...options,
            cspSource: 'https://example.com',
        })
        expect(result).toBe(
            '<meta http-equiv="Content-Security-Policy" content="default-src https://example.com https://example.com;">'
        )
    })

    it('handles multiple replacements correctly', () => {
        const html =
            '<!-- START CSP --><meta http-equiv="Content-Security-Policy" content="default-src \'self\';"><!-- END CSP --><img src="./image1.png"><img src="./image2.png"><script>/*injectedScript*/</script><style>/*injectedStyle*/</style>'
        const result = manipulateWebviewHTML(html, {
            ...options,
            resources: Uri.parse('https://example.com/resources'),
            injectScript: 'console.log("Test")',
            injectStyle: 'body { color: blue; }',
        })
        expect(result).not.toContain('Content-Security-Policy')
        expect(result).toContain('https://example.com/resources/image1.png')
        expect(result).toContain('https://example.com/resources/image2.png')
        expect(result).toContain('console.log("Test")')
        expect(result).toContain('body { color: blue; }')
    })
})
