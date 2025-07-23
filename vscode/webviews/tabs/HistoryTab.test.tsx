import { CodyIDE, type WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import { render, screen } from '@testing-library/react'
import { Observable } from 'observable-fns'
import { describe, expect, test, vi } from 'vitest'
import { AppWrapperForTest } from '../AppWrapperForTest'
import { HistoryTabWithData } from './HistoryTab'

// Mock VSCodeApi
vi.mock('../utils/VSCodeApi', () => ({
    getVSCodeAPI: vi.fn().mockReturnValue({
        postMessage: vi.fn(),
        onMessage: vi.fn().mockReturnValue(() => {}),
        setState: vi.fn(),
        getState: vi.fn(),
    }),
}))

// Create a proper mock for extensionAPI
const createMockExtensionAPI = (): WebviewToExtensionAPI => ({
    mentionMenuData: vi.fn(),
    evaluatedFeatureFlag: vi.fn(),
    prompts: vi.fn().mockReturnValue({ arePromptsSupported: false, actions: [], query: '' }),
    promptTags: vi.fn().mockReturnValue([]),
    getCurrentUserId: vi.fn().mockReturnValue(null),
    repos: vi.fn().mockReturnValue([]),
    clientActionBroadcast: () => new Observable(() => {}),
    promptsMigrationStatus: vi.fn().mockReturnValue({ type: 'no_migration_needed' }),
    startPromptsMigration: vi.fn().mockReturnValue(undefined),
    models: vi.fn().mockReturnValue(null),
    chatModels: vi.fn().mockReturnValue([]),
    highlights: vi.fn().mockReturnValue([]),
    hydratePromptMessage: vi.fn().mockReturnValue({} as any),
    setChatModel: vi.fn().mockReturnValue(undefined),
    defaultContext: vi.fn().mockReturnValue({ corpusContext: [], initialContext: [] }),
    resolvedConfig: vi.fn().mockReturnValue({} as any),
    authStatus: vi.fn().mockReturnValue({ isLoggedIn: false }),
    transcript: vi.fn().mockReturnValue([]),
    userHistory: vi.fn().mockReturnValue(null),
    frequentlyUsedContextItems: vi.fn().mockReturnValue([]),
    mcpSettings: () => new Observable(() => {}),
})

describe('HistoryTabWithData', () => {
    test('renders empty state when there are no non-empty chats', () => {
        const setView = vi.fn()
        const extensionAPI = createMockExtensionAPI()
        const emptyChats = [
            { id: '1', interactions: [], lastInteractionTimestamp: new Date().toISOString() },
        ]

        render(
            <HistoryTabWithData
                extensionAPI={extensionAPI}
                setView={setView}
                chats={emptyChats}
                IDE={CodyIDE.VSCode}
            />,
            {
                wrapper: AppWrapperForTest,
            }
        )

        expect(screen.getByText(/no chat history/i)).toBeInTheDocument()
        expect(screen.getByText(/Start a new chat/i)).toBeInTheDocument()
    })
})
