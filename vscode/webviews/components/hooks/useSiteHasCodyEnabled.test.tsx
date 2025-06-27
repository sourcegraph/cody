import type { WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import { ExtensionAPIProviderForTestsOnly, MOCK_API } from '@sourcegraph/prompt-editor'
import { render, waitFor } from '@testing-library/react'
import { Observable } from 'observable-fns'
import { describe, expect, test } from 'vitest'
import { useSiteHasCodyEnabled } from './useSiteHasCodyEnabled'

// Test component that uses the hook
function TestComponent() {
    const siteHasCodyEnabled = useSiteHasCodyEnabled()
    return (
        <div data-testid="result">
            {siteHasCodyEnabled.value === undefined ? 'loading' : String(siteHasCodyEnabled.value)}
        </div>
    )
}

describe('useSiteHasCodyEnabled', () => {
    test('returns true when site has Cody enabled', async () => {
        const mockAPI: WebviewToExtensionAPI = {
            ...MOCK_API,
            getSiteHasCodyEnabled: () => Observable.of(true),
        }

        const { getByTestId } = render(
            <ExtensionAPIProviderForTestsOnly value={mockAPI}>
                <TestComponent />
            </ExtensionAPIProviderForTestsOnly>
        )

        await waitFor(() => {
            expect(getByTestId('result')).toHaveTextContent('true')
        })
    })

    test('returns false when site does not have Cody enabled', async () => {
        const mockAPI: WebviewToExtensionAPI = {
            ...MOCK_API,
            getSiteHasCodyEnabled: () => Observable.of(false),
        }

        const { getByTestId } = render(
            <ExtensionAPIProviderForTestsOnly value={mockAPI}>
                <TestComponent />
            </ExtensionAPIProviderForTestsOnly>
        )

        await waitFor(() => {
            expect(getByTestId('result')).toHaveTextContent('false')
        })
    })

    test('handles error case', async () => {
        const error = new Error('API error')
        const mockAPI: WebviewToExtensionAPI = {
            ...MOCK_API,
            getSiteHasCodyEnabled: () => Observable.of(error),
        }

        const { getByTestId } = render(
            <ExtensionAPIProviderForTestsOnly value={mockAPI}>
                <TestComponent />
            </ExtensionAPIProviderForTestsOnly>
        )

        await waitFor(() => {
            expect(getByTestId('result')).toHaveTextContent('Error: API error')
        })
    })
})
