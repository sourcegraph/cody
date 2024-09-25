import {
    AUTH_STATUS_FIXTURE_AUTHED,
    type AuthenticatedAuthStatus,
    type ChatClient,
    type ContextItem,
    ContextItemSource,
    DOTCOM_URL,
    featureFlagProvider,
    mockAuthStatus,
    modelsService,
    ps,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'
import type { ChatModel } from '../chat/chat-view/ChatModel'
import type { ContextRetriever } from '../chat/chat-view/ContextRetriever'
import * as clientStateBroadcaster from '../chat/clientStateBroadcaster'
import { CodyReflectionAgent } from './agentic'

describe('CodyReflectionAgent', () => {
    const codyProAuthStatus: AuthenticatedAuthStatus = {
        ...AUTH_STATUS_FIXTURE_AUTHED,
        endpoint: DOTCOM_URL.toString(),
        authenticated: true,
        userCanUpgrade: false,
    }
    const enterpriseAuthStatus: AuthenticatedAuthStatus = {
        ...AUTH_STATUS_FIXTURE_AUTHED,
        endpoint: 'https://example.sourcegraph.com',
        authenticated: true,
        userCanUpgrade: false,
    }

    let mockChatModel: ChatModel
    let mockChatClient: ChatClient
    let mockContextRetriever: ContextRetriever
    let mockSpan: any
    let mockCurrentContext: ContextItem[]

    beforeEach(() => {
        mockAuthStatus(codyProAuthStatus)
        mockChatModel = {
            modelID: 'sourcegraph/cody-reflection',
            addHumanMessage: vi.fn(),
            addBotMessage: vi.fn(),
            contextWindow: { input: 10000, output: 1000 },
            getDehydratedMessages: vi.fn().mockReturnValue([
                {
                    speaker: 'human',
                    text: ps`test message`,
                },
            ]),
        } as unknown as ChatModel

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
    })

    it('initializes correctly for dotcom user', async () => {
        const agent = new CodyReflectionAgent(
            mockChatModel,
            mockChatClient,
            mockContextRetriever,
            mockSpan,
            mockCurrentContext
        )

        expect(agent).toBeDefined()
    })

    it('retrieves additional context when enabled', async () => {
        const mockStreamResponse = [
            { type: 'change', text: '<CODYTOOLSEARCH><query>test query</query></CODYTOOLSEARCH>' },
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

        vi.spyOn(clientStateBroadcaster, 'getCodebaseContextItemsForEditorState').mockResolvedValue({
            type: 'tree',
            uri: URI.file('/path/to/repo/'),
            name: 'Mock Repository',
            isWorkspaceRoot: true,
            content: null,
            source: ContextItemSource.Initial,
        })

        const agent = new CodyReflectionAgent(
            mockChatModel,
            mockChatClient,
            mockContextRetriever,
            mockSpan,
            mockCurrentContext
        )

        const result = await agent.getContext({ aborted: false } as AbortSignal)

        expect(result).toHaveLength(1)
        expect(result[0].content).toBe('const newExample = "test result";')
        expect(mockChatClient.chat).toHaveBeenCalled()
        expect(mockContextRetriever.retrieveContext).toHaveBeenCalled()
    })

    it('does not retrieve additional context for enterprise user without feature flag', async () => {
        mockAuthStatus(enterpriseAuthStatus)
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))

        const agent = new CodyReflectionAgent(
            mockChatModel,
            mockChatClient,
            mockContextRetriever,
            mockSpan,
            mockCurrentContext
        )

        const result = await agent.getContext({ aborted: false } as AbortSignal)

        expect(result).toHaveLength(0)
        expect(mockChatClient.chat).not.toHaveBeenCalled()
        expect(mockContextRetriever.retrieveContext).not.toHaveBeenCalled()
    })
})
