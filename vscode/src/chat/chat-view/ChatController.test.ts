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
    } satisfies ChatControllerOptions['contextRetriever']

    const mockEditor: VSCodeEditor = {} as any
    const mockExtensionClient: Pick<ExtensionClient, 'capabilities'> = {
        capabilities: {},
    }
    const mockGuardrails: Guardrails = {} as any

    vi.spyOn(featureFlagProviderModule.featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(
        Observable.of(true)
    )

    vi.spyOn(
        githubRepoMetadataModule,
        'publicRepoMetadataIfAllWorkspaceReposArePublic',
        'get'
    ).mockReturnValue(Observable.of({ isPublic: false, repoMetadata: undefined }))

    vi.spyOn(graphqlClient, 'getSiteVersion').mockResolvedValue('1.2.3')

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
            chatIntentAPIClient: null,
        })
    })

    test('send, followup, and edit', async () => {
        const postMessageSpy = vi
            .spyOn(chatController as any, 'postMessage')
            .mockImplementation(() => {})
        const addBotMessageSpy = vi.spyOn(chatController as any, 'addBotMessage')

        mockChatClient.chat.mockReturnValue(
            (async function* () {
                yield { type: 'change', text: 'Test reply 1' }
                yield { type: 'complete', text: 'Test reply 1' }
            })() satisfies AsyncGenerator<CompletionGeneratorValue>
        )
        mockContextRetriever.retrieveContext.mockResolvedValue([])

        // Send the first message in a new chat.
        await chatController.handleUserMessageSubmission({
            requestID: '1',
            inputText: PromptString.unsafe_fromUserQuery('Test input'),
            mentions: [],
            editorState: null,
            signal: new AbortController().signal,
            source: 'chat',
        })
        expect(postMessageSpy.mock.calls.at(2)?.at(0)).toStrictEqual<
            Extract<ExtensionMessage, { type: 'transcript' }>
        >({
            type: 'transcript',
            isMessageInProgress: true,
            chatID: mockNowDate.toUTCString(),
            messages: [
                {
                    speaker: 'human',
                    text: 'Test input',
                    intent: undefined,
                    model: undefined,
                    error: undefined,
                    editorState: null,
                    contextFiles: [],
                },
                {
                    speaker: 'assistant',
                    model: 'my-model',
                    intent: undefined,
                    error: undefined,
                    editorState: undefined,
                    text: undefined,
                    contextFiles: undefined,
                },
            ],
        })

        // Make sure it was sent and the reply was received.
        await vi.runOnlyPendingTimersAsync()
        expect(mockChatClient.chat).toBeCalledTimes(1)
        expect(addBotMessageSpy).toHaveBeenCalledWith('1', ps`Test reply 1`, 'my-model')
        expect(postMessageSpy.mock.calls.at(4)?.at(0)).toStrictEqual<
            Extract<ExtensionMessage, { type: 'transcript' }>
        >({
            type: 'transcript',
            isMessageInProgress: false,
            chatID: mockNowDate.toUTCString(),
            messages: [
                {
                    speaker: 'human',
                    text: 'Test input',
                    intent: undefined,
                    model: undefined,
                    error: undefined,
                    editorState: null,
                    contextFiles: [],
                },
                {
                    speaker: 'assistant',
                    intent: undefined,
                    model: 'my-model',
                    error: undefined,
                    editorState: undefined,
                    text: 'Test reply 1',
                    contextFiles: undefined,
                },
            ],
        })

        // Send a followup.
        vi.clearAllMocks()
        mockChatClient.chat.mockReturnValue(
            (async function* () {
                yield { type: 'change', text: 'Test reply 2' }
                yield { type: 'complete', text: 'Test reply 2' }
            })() satisfies AsyncGenerator<CompletionGeneratorValue>
        )
        await chatController.handleUserMessageSubmission({
            requestID: '2',
            inputText: PromptString.unsafe_fromUserQuery('Test followup'),
            mentions: [],
            editorState: null,
            signal: new AbortController().signal,
            source: 'chat',
        })
        await vi.runOnlyPendingTimersAsync()
        expect(mockChatClient.chat).toBeCalledTimes(1)
        expect(addBotMessageSpy).toHaveBeenCalledWith('2', ps`Test reply 2`, 'my-model')
        expect(postMessageSpy.mock.calls.at(3)?.at(0)).toStrictEqual<
            Extract<ExtensionMessage, { type: 'transcript' }>
        >({
            type: 'transcript',
            isMessageInProgress: false,
            chatID: mockNowDate.toUTCString(),
            messages: [
                {
                    speaker: 'human',
                    text: 'Test input',
                    intent: undefined,
                    model: undefined,
                    error: undefined,
                    editorState: null,
                    contextFiles: [],
                },
                {
                    speaker: 'assistant',
                    model: 'my-model',
                    intent: undefined,
                    error: undefined,
                    editorState: undefined,
                    text: 'Test reply 1',
                    contextFiles: undefined,
                },
                {
                    speaker: 'human',
                    text: 'Test followup',
                    intent: undefined,
                    model: undefined,
                    error: undefined,
                    editorState: null,
                    contextFiles: [],
                },
                {
                    speaker: 'assistant',
                    model: 'my-model',
                    intent: undefined,
                    error: undefined,
                    editorState: undefined,
                    text: 'Test reply 2',
                    contextFiles: undefined,
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
        expect(addBotMessageSpy).toHaveBeenCalledWith('3', ps`Test reply 3`, 'my-model')
        expect(postMessageSpy.mock.calls.at(3)?.at(0)).toStrictEqual<
            Extract<ExtensionMessage, { type: 'transcript' }>
        >({
            type: 'transcript',
            isMessageInProgress: false,
            chatID: mockNowDate.toUTCString(),
            messages: [
                {
                    speaker: 'human',
                    text: 'Test input',
                    intent: undefined,
                    model: undefined,
                    error: undefined,
                    editorState: null,
                    contextFiles: [],
                },
                {
                    speaker: 'assistant',
                    model: 'my-model',
                    intent: undefined,
                    error: undefined,
                    editorState: undefined,
                    text: 'Test reply 1',
                    contextFiles: undefined,
                },
                {
                    speaker: 'human',
                    text: 'Test edit',
                    intent: undefined,
                    model: undefined,
                    error: undefined,
                    editorState: null,
                    contextFiles: [],
                },
                {
                    speaker: 'assistant',
                    model: 'my-model',
                    intent: undefined,
                    error: undefined,
                    editorState: undefined,
                    text: 'Test reply 3',
                    contextFiles: undefined,
                },
            ],
        })
    })

    test('send error', async () => {
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
        await chatController.handleUserMessageSubmission({
            requestID: '1',
            inputText: PromptString.unsafe_fromUserQuery('Test input'),
            mentions: [],
            editorState: null,
            signal: new AbortController().signal,
            source: 'chat',
        })
        await vi.runOnlyPendingTimersAsync()
        expect(mockChatClient.chat).toBeCalledTimes(1)
        expect(addBotMessageSpy).toHaveBeenCalledWith('1', ps`Test partial reply`, 'my-model')
        expect(postMessageSpy.mock.calls.at(4)?.at(0)).toStrictEqual<
            Extract<ExtensionMessage, { type: 'transcript' }>
        >({
            type: 'transcript',
            isMessageInProgress: false,
            chatID: mockNowDate.toUTCString(),
            messages: [
                {
                    speaker: 'human',
                    text: 'Test input',
                    model: undefined,
                    error: undefined,
                    editorState: null,
                    contextFiles: [],
                    intent: undefined,
                },
                {
                    speaker: 'assistant',
                    model: undefined,
                    error: errorToChatError(new Error('my-error')),
                    intent: undefined,
                    editorState: undefined,
                    text: undefined,
                    contextFiles: undefined,
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
