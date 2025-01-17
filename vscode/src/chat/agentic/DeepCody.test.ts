import {
    AUTH_STATUS_FIXTURE_AUTHED,
    type AuthenticatedAuthStatus,
    CLIENT_CAPABILITIES_FIXTURE,
    type ChatClient,
    type ContextItem,
    ContextItemSource,
    DOTCOM_URL,
    type ProcessingStep,
    featureFlagProvider,
    mockAuthStatus,
    mockClientCapabilities,
    mockResolvedConfig,
    modelsService,
    ps,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { mockLocalStorage } from '../../services/LocalStorageProvider'
import { ChatBuilder } from '../chat-view/ChatBuilder'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import * as initialContext from '../initialContext'
import { CodyToolProvider } from './CodyToolProvider'
import { DeepCodyAgent } from './DeepCody'

describe('DeepCody', () => {
    const codyProAuthStatus: AuthenticatedAuthStatus = {
        ...AUTH_STATUS_FIXTURE_AUTHED,
        endpoint: DOTCOM_URL.toString(),
        authenticated: true,
    }

    const mockRretrievedResult = [
        {
            type: 'file',
            uri: URI.file('/path/to/repo/newfile.ts'),
            content: 'const newExample = "test result";',
            source: ContextItemSource.Search,
        },
    ] satisfies ContextItem[]

    let mockChatBuilder: ChatBuilder
    let mockChatClient: ChatClient
    let mockContextRetriever: ContextRetriever
    let mockCurrentContext: ContextItem[]
    let mockCodyToolProvider: typeof CodyToolProvider
    let localStorageData: { [key: string]: unknown } = {}
    let mockStatusCallback: (steps: ProcessingStep[]) => void
    let mockRequestCallback: (steps: ProcessingStep) => Promise<boolean>

    mockLocalStorage({
        get: (key: string) => localStorageData[key],
        update: (key: string, value: unknown) => {
            localStorageData[key] = value
        },
    } as any)

    beforeEach(async () => {
        mockResolvedConfig({ configuration: {}, auth: { serverEndpoint: DOTCOM_URL.toString() } })
        mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)
        mockAuthStatus(codyProAuthStatus)
        localStorageData = {}
        mockChatBuilder = {
            selectedModel: 'anthropic::2023-06-01::claude-3.5-sonnet',
            changes: {
                pipe: vi.fn(),
            },
            resolvedModelForChat: vi.fn().mockReturnValue('anthropic::2023-06-01::claude-3.5-sonnet'),
            addHumanMessage: vi.fn(),
            addBotMessage: vi.fn(),
            contextWindowForChat: vi.fn().mockReturnValue({ input: 10000, output: 1000 }),
            getDehydratedMessages: vi.fn().mockReturnValue([
                {
                    speaker: 'human',
                    text: ps`test message`,
                },
            ]),
        } as unknown as ChatBuilder

        mockChatClient = {
            chat: vi.fn(),
        } as unknown as ChatClient

        mockContextRetriever = {
            retrieveContext: vi.fn().mockResolvedValue(mockRretrievedResult),
        } as unknown as ContextRetriever

        CodyToolProvider.initialize(mockContextRetriever)
        mockCodyToolProvider = CodyToolProvider

        mockCurrentContext = [
            {
                uri: URI.file('/path/to/file.ts'),
                type: 'file',
                isTooLarge: undefined,
                source: ContextItemSource.Search,
                content: 'const example = "test";',
            },
        ]

        mockStatusCallback = vi.fn()
        mockRequestCallback = vi.fn().mockResolvedValue(true)

        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
        vi.spyOn(modelsService, 'isStreamDisabled').mockReturnValue(false)
        vi.spyOn(ChatBuilder, 'resolvedModelForChat').mockReturnValue(
            Observable.of('anthropic::2023-06-01::claude-3.5-sonnet')
        )
        vi.spyOn(ChatBuilder, 'contextWindowForChat').mockReturnValue(
            Observable.of({ input: 10000, output: 1000 })
        )
        // Ensure mockChatBuilder has a changes property
        mockChatBuilder.changes = Observable.of(mockChatBuilder)
        vi.spyOn(modelsService, 'observeContextWindowByID').mockReturnValue(
            Observable.of({ input: 10000, output: 1000 })
        )
        mockContextRetriever.retrieveContext = vi.fn().mockResolvedValue(mockRretrievedResult)

        vi.spyOn(initialContext, 'getCorpusContextItemsForEditorState').mockReturnValue(
            Observable.of([
                {
                    type: 'tree',
                    uri: URI.file('/path/to/repo/'),
                    name: 'Mock Repository',
                    isWorkspaceRoot: true,
                    isIndexedRemotely: true,
                    content: null,
                    source: ContextItemSource.Initial,
                },
            ])
        )
    })

    it('initializes correctly when invoked', async () => {
        const agent = new DeepCodyAgent(
            mockChatBuilder,
            mockChatClient,
            mockStatusCallback,
            mockRequestCallback
        )

        expect(agent).toBeDefined()
    })

    it('retrieves additional context when response contains tool tags', async () => {
        const mockStreamResponse = [
            {
                type: 'change',
                text: '<context_list>path/to/file.ts</context_list><TOOLSEARCH><query>test query</query></TOOLSEARCH><next_step>',
            },
            { type: 'complete' },
        ]

        mockChatClient.chat = vi.fn().mockReturnValue(mockStreamResponse)

        vi.spyOn(initialContext, 'getCorpusContextItemsForEditorState').mockReturnValue(
            Observable.of([
                {
                    type: 'tree',
                    uri: URI.file('/path/to/repo/'),
                    name: 'Mock Repository',
                    isWorkspaceRoot: true,
                    isIndexedRemotely: true,
                    content: null,
                    source: ContextItemSource.Initial,
                },
            ])
        )

        const agent = new DeepCodyAgent(
            mockChatBuilder,
            mockChatClient,
            mockStatusCallback,
            mockRequestCallback
        )

        const result = await agent.getContext(
            'deep-cody-test-interaction-id',
            new AbortController().signal,
            mockCurrentContext
        )

        const mockTools = mockCodyToolProvider.getTools()
        expect(mockChatClient.chat).toHaveBeenCalled()
        expect(mockTools).toHaveLength(3)
        expect(mockTools.some(tool => tool.config.tags.tag === ps`TOOLCLI`)).toBeFalsy()

        expect(result.some(r => r.content === 'const example = "test";')).toBeTruthy()
        expect(result.some(r => r.content === 'const newExample = "test result";')).toBeFalsy()
    })

    it('retrieves removes current context if current context is not included in context_list', async () => {
        const mockStreamResponse = [
            {
                type: 'change',
                text: '<context_list>path/to/repo/newfile.ts</context_list><TOOLSEARCH><query>test query 1</query></TOOLSEARCH><TOOLSEARCH><query>test query 2</query></TOOLSEARCH>',
            },
            { type: 'complete' },
        ]

        mockChatClient.chat = vi.fn().mockReturnValue(mockStreamResponse)

        vi.spyOn(initialContext, 'getCorpusContextItemsForEditorState').mockReturnValue(
            Observable.of([
                {
                    type: 'tree',
                    uri: URI.file('/path/to/repo/'),
                    name: 'Mock Repository',
                    isWorkspaceRoot: true,
                    isIndexedRemotely: true,
                    content: null,
                    source: ContextItemSource.Initial,
                },
            ])
        )

        const agent = new DeepCodyAgent(
            mockChatBuilder,
            mockChatClient,
            mockStatusCallback,
            mockRequestCallback
        )

        const result = await agent.getContext(
            'deep-cody-test-interaction-id',
            new AbortController().signal,
            mockCurrentContext
        )

        expect(mockChatClient.chat).toHaveBeenCalled()
        expect(result.some(r => r.content === 'const example = "test";')).toBeFalsy()
        expect(result.some(r => r.content === 'const newExample = "test result";')).toBeTruthy()
    })

    it('validates and preserves context items during review process', async () => {
        // Mock a scenario where we have existing context items
        const existingContext = [
            {
                uri: URI.file('/path/to/file1.ts'),
                type: 'file',
                source: ContextItemSource.User,
                content: 'const userAddedFile = "test";',
            },
            {
                uri: URI.file('/path/to/file2.ts'),
                type: 'file',
                source: ContextItemSource.Search,
                content: 'const searchResult = "test";',
            },
        ] satisfies ContextItem[]

        // Mock the chat messages to include context files
        mockChatBuilder.getDehydratedMessages = vi.fn().mockReturnValue([
            {
                speaker: 'human',
                text: ps`test message`,
                contextFiles: existingContext,
            },
        ])

        // Mock stream response that includes context validation tags
        const mockStreamResponse = [
            {
                type: 'change',
                text: '<context_list>file1.ts</context_list><context_list>file2.ts</context_list><context_list>newfile.ts</context_list>',
            },
            { type: 'complete' },
        ]

        mockChatClient.chat = vi.fn().mockReturnValue(mockStreamResponse)

        // Create agent and run context retrieval
        const agent = new DeepCodyAgent(
            mockChatBuilder,
            mockChatClient,
            mockStatusCallback,
            mockRequestCallback
        )
        const result = await agent.getContext(
            'deep-cody-test-validation-id',
            new AbortController().signal,
            existingContext
        )

        // Verify results
        expect(mockChatClient.chat).toHaveBeenCalled()

        // Should preserve user-added context as is
        expect(result.some(r => r.content === 'const userAddedFile = "test";')).toBeTruthy()
        expect(result.some(r => r.source === ContextItemSource.User)).toBeTruthy()

        // Should include validated context from review
        expect(result.some(r => r.content === 'const searchResult = "test";')).toBeTruthy()
        // Should replace search context with agentic source during validation.
        expect(result.filter(r => r.source === ContextItemSource.Search).length).toBe(0)
    })
})
