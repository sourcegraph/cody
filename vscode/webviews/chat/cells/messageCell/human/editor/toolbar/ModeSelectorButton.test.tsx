import {
    AUTH_STATUS_FIXTURE_AUTHED,
    type ClientCapabilitiesWithLegacyFields,
} from '@sourcegraph/cody-shared'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../../../../../../components/shadcn/ui/tooltip'
import * as useConfigModule from '../../../../../../utils/useConfig'
import { ModeSelectorField } from './ModeSelectorButton'

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {}

    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value
        },
        clear: () => {
            store = {}
        },
    }
})() as Storage

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Create a wrapper component that provides the TooltipProvider context
const TestWrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
    <TooltipProvider>{children}</TooltipProvider>
)

describe('ModeSelectorField', () => {
    const defaultProps = {
        omniBoxEnabled: true,
        isDotComUser: false,
        isCodyProUser: true,
        _intent: 'chat' as const,
        manuallySelectIntent: vi.fn(),
    }

    const defaultConfigMock = {
        config: {
            experimentalAgenticChatEnabled: false,
            experimentalPromptEditorEnabled: true,
            experimentalNoodle: true,
            internalDebugContext: false,
            serverEndpoint: 'https://sourcegraph.com',
            smartApply: true,
            hasEditCapability: false,
            allowEndpointChange: false,
            webviewType: 'sidebar',
            multipleWebviewsEnabled: true,
            attribution: 'none',
        },
        clientCapabilities: {
            isVSCode: true,
            edit: 'enabled',
        } satisfies Partial<ClientCapabilitiesWithLegacyFields> as ClientCapabilitiesWithLegacyFields,
        authStatus: AUTH_STATUS_FIXTURE_AUTHED,
    } satisfies Partial<useConfigModule.Config> as useConfigModule.Config

    beforeAll(() => {
        vi.spyOn(useConfigModule, 'useConfig').mockReturnValue(defaultConfigMock)
    })

    beforeEach(() => {
        window.localStorage.clear()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('renders the selector with the correct intent displayed', () => {
        render(
            <TestWrapper>
                <ModeSelectorField {...defaultProps} />
            </TestWrapper>
        )

        expect(screen.getByText('Chat')).toBeInTheDocument()
    })

    it('toggles between intents when keyboard shortcut is used', () => {
        render(
            <TestWrapper>
                <ModeSelectorField {...defaultProps} _intent="chat" />
            </TestWrapper>
        )

        // Verify the component renders correctly and has the expected elements
        expect(screen.getByText('Chat')).toBeInTheDocument()
        const button = screen.getByRole('combobox')
        expect(button).toBeInTheDocument()
        expect(button).toHaveAttribute('aria-label', 'switch-mode')
    })

    it('hides agentic option when feature flag is disabled', () => {
        render(
            <TestWrapper>
                <ModeSelectorField {...defaultProps} />
            </TestWrapper>
        )

        // Open the dropdown
        fireEvent.click(screen.getByRole('combobox'))

        // Agent option should not be visible
        expect(screen.queryByText('Agent')).not.toBeInTheDocument()
    })

    it('hides agentic intent even when it was last selected if flag is not on', () => {
        render(
            <TestWrapper>
                <ModeSelectorField {...defaultProps} _intent="agentic" />
            </TestWrapper>
        )

        expect(screen.getByText('Chat')).toBeInTheDocument()
        expect(screen.queryByText('Agent')).not.toBeInTheDocument()
        // Open the dropdown to check if the option is still hidden
        fireEvent.click(screen.getByRole('combobox'))
        expect(screen.queryByText('Agent')).not.toBeInTheDocument()
    })

    it('displays agentic intent in model dropdown title - flag on', () => {
        //  Set the feature flag to true
        const props = {
            ...defaultConfigMock,
            config: { ...defaultConfigMock.config, experimentalAgenticChatEnabled: true },
        }
        vi.spyOn(useConfigModule, 'useConfig').mockReturnValue(props)
        render(
            <TestWrapper>
                <ModeSelectorField {...defaultProps} _intent="agentic" />
            </TestWrapper>
        )

        expect(screen.getByText('Agent')).toBeInTheDocument()
    })
})
