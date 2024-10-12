import {
    AUTH_STATUS_FIXTURE_AUTHED,
    type AuthenticatedAuthStatus,
    CLIENT_CAPABILITIES_FIXTURE,
    type ChatClient,
    type ContextItem,
    ContextItemSource,
    DOTCOM_URL,
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
import { ChatBuilder } from '../chat-view/ChatBuilder'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import * as initialContext from '../initialContext'
import { getCodyTools } from './CodyTool'
import { DeepCodyAgent } from './DeepCody'

const DeepCodyModel = DeepCodyAgent.ModelRef

describe('DeepCody', () => {
    const codyProAuthStatus: AuthenticatedAuthStatus = {
        ...AUTH_STATUS_FIXTURE_AUTHED,
        endpoint: DOTCOM_URL.toString(),
        authenticated: true,
    }
    const enterpriseAuthStatus: AuthenticatedAuthStatus = {
        ...AUTH_STATUS_FIXTURE_AUTHED,
        endpoint: 'https://example.sourcegraph.com',
        authenticated: true,
    }

    let mockChatBuilder: ChatBuilder
    let mockChatClient: ChatClient
    let mockContextRetriever: ContextRetriever
    let mockSpan: any
    let mockCurrentContext: ContextItem[]

    beforeEach(() => {
        mockResolvedConfig({ configuration: {} })
        mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)
        mockAuthStatus(codyProAuthStatus)
        mockChatBuilder = {
            selectedModel: 'anthropic::2023-06-01::deep-cody',
            changes: {
                pipe: vi.fn(),
            },
            resolvedModelForChat: vi.fn().mockReturnValue('anthropic::2023-06-01::deep-cody'),
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
            retrieveContext: vi.fn(),
        } as unknown as ContextRetriever

        mockSpan = {}

        mockCurrentContext = [
            {
                uri: URI.file('/path/to/file.ts'),
                type: 'file',
                isTooLarge: undefined,
                source: ContextItemSource.User,
                content: 'const example = "test";',
            },
        ]

        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
        vi.spyOn(modelsService, 'isStreamDisabled').mockReturnValue(false)
        vi.spyOn(ChatBuilder, 'resolvedModelForChat').mockReturnValue(Observable.of(DeepCodyModel))
        vi.spyOn(ChatBuilder, 'contextWindowForChat').mockReturnValue(
            Observable.of({ input: 10000, output: 1000 })
        )
        // Ensure mockChatBuilder has a changes property
        mockChatBuilder.changes = Observable.of(mockChatBuilder)
        vi.spyOn(modelsService, 'observeContextWindowByID').mockReturnValue(
            Observable.of({ input: 10000, output: 1000 })
        )
    })

    it('initializes correctly when invoked', async () => {
        const agent = new DeepCodyAgent(
            mockChatBuilder,
            mockChatClient,
            getCodyTools(mockContextRetriever, mockSpan),
            mockCurrentContext
        )

        expect(agent).toBeDefined()
    })

    it('retrieves additional context when enabled', async () => {
        const mockStreamResponse = [
            { type: 'change', text: '<TOOLSEARCH><query>test query</query></TOOLSEARCH>' },
            { type: 'complete' },
        ]

        mockChatClient.chat = vi.fn().mockReturnValue(mockStreamResponse)

        mockContextRetriever.retrieveContext = vi.fn().mockResolvedValue([
            {
                type: 'file',
                uri: URI.file('/path/to/repo/newfile.ts'),
                content: 'const newExample = "test result";',
            },
        ])

        vi.spyOn(initialContext, 'getCorpusContextItemsForEditorState').mockReturnValue(
            Observable.of([
                {
                    type: 'tree',
                    uri: URI.file('/path/to/repo/'),
                    name: 'Mock Repository',
                    isWorkspaceRoot: true,
                    content: null,
                    source: ContextItemSource.Initial,
                },
            ])
        )

        const agent = new DeepCodyAgent(
            mockChatBuilder,
            mockChatClient,
            getCodyTools(mockContextRetriever, mockSpan),
            mockCurrentContext
        )

        const result = await agent.getContext({ aborted: false } as AbortSignal)

        expect(mockChatClient.chat).toHaveBeenCalled()
        expect(mockContextRetriever.retrieveContext).toHaveBeenCalled()
        expect(result).toHaveLength(2)
        expect(result[0].content).toBe('const newExample = "test result";')
    })

    it('does not retrieve additional context for enterprise user without feature flag', async () => {
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
        mockAuthStatus(enterpriseAuthStatus)
        expect(mockChatClient.chat).not.toHaveBeenCalled()
        expect(mockContextRetriever.retrieveContext).not.toHaveBeenCalled()
    })
})
