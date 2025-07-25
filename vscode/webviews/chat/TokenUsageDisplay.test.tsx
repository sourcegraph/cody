import { render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import { ConfigProvider } from '../utils/useConfig'
import { TokenUsageDisplay } from './TokenUsageDisplay'

const mockConfig = (
    internalDebugTokenUsage: boolean
): ComponentProps<typeof ConfigProvider>['value'] => ({
    authStatus: {
        endpoint: 'https://sourcegraph.example.com',
        authenticated: true,
    } as any,
    config: {
        internalDebugTokenUsage,
        smartApply: true,
        hasEditCapability: true,
        allowEndpointChange: true,
        experimentalPromptEditorEnabled: false,
        experimentalAgenticChatEnabled: false,
        attribution: 'none',
        serverEndpoint: 'https://sourcegraph.example.com',
    } as any,
    clientCapabilities: {} as any,
})

describe('TokenUsageDisplay', () => {
    it('should not render when config is disabled', () => {
        const { container } = render(
            <ConfigProvider value={mockConfig(false)}>
                <TokenUsageDisplay
                    tokenUsage={{
                        completionTokens: 100,
                        promptTokens: 50,
                        totalTokens: 150,
                    }}
                />
            </ConfigProvider>
        )
        expect(container.firstChild).toBeNull()
    })

    it('should render when config is enabled', () => {
        const { getByText } = render(
            <ConfigProvider value={mockConfig(true)}>
                <TokenUsageDisplay
                    tokenUsage={{
                        completionTokens: 100,
                        promptTokens: 50,
                        totalTokens: 150,
                    }}
                />
            </ConfigProvider>
        )

        expect(getByText('Completion tokens: 100')).toBeInTheDocument()
        expect(getByText('Prompt tokens: 50')).toBeInTheDocument()
        expect(getByText('Total tokens: 150')).toBeInTheDocument()
    })

    it('should not render when tokenUsage is undefined', () => {
        const { container } = render(
            <ConfigProvider value={mockConfig(true)}>
                <TokenUsageDisplay tokenUsage={undefined} />
            </ConfigProvider>
        )
        expect(container.firstChild).toBeNull()
    })

    it('should not render when all token values are undefined', () => {
        const { container } = render(
            <ConfigProvider value={mockConfig(true)}>
                <TokenUsageDisplay
                    tokenUsage={{
                        completionTokens: undefined,
                        promptTokens: undefined,
                        totalTokens: undefined,
                    }}
                />
            </ConfigProvider>
        )
        expect(container.firstChild).toBeNull()
    })
})
