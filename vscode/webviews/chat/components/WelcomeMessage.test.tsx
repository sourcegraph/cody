import { AUTH_STATUS_FIXTURE_AUTHED, type ClientCapabilities } from '@sourcegraph/cody-shared'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { AppWrapperForTest } from '../../AppWrapperForTest'
import { usePromptsQuery } from '../../components/promptList/usePromptsQuery'
import { FIXTURE_PROMPTS } from '../../components/promptSelectField/fixtures'
import * as useConfigModule from '../../utils/useConfig'
import { WelcomeMessage } from './WelcomeMessage'

vi.mock('../../components/promptList/usePromptsQuery')
vi.mocked(usePromptsQuery).mockReturnValue({
    value: {
        query: '',
        arePromptsSupported: true,
        actions: [{ ...FIXTURE_PROMPTS[0], actionType: 'prompt' }],
    },
    done: false,
    error: null,
})

describe('WelcomeMessage', () => {
    function openCollapsiblePanels(): void {
        const closedPanelButtons = document.querySelectorAll('button[data-state="closed"]')
        for (const button of closedPanelButtons) {
            fireEvent.click(button)
        }
    }
    test('renders for CodyIDE.VSCode', () => {
        vi.spyOn(useConfigModule, 'useConfig').mockReturnValue({
            clientCapabilities: {
                isVSCode: true,
            } satisfies Partial<ClientCapabilities> as ClientCapabilities,
            authStatus: AUTH_STATUS_FIXTURE_AUTHED,
        } satisfies Partial<useConfigModule.Config> as useConfigModule.Config)
        render(<WelcomeMessage setView={() => {}} />, {
            wrapper: AppWrapperForTest,
        })
        openCollapsiblePanels()

        // Check common elements
        expect(screen.getByText(FIXTURE_PROMPTS[0].name)).toBeInTheDocument()
    })

    test('renders for CodyIDE.JetBrains', () => {
        vi.spyOn(useConfigModule, 'useConfig').mockReturnValue({
            clientCapabilities: {
                isVSCode: false,
            } satisfies Partial<ClientCapabilities> as ClientCapabilities,
            authStatus: AUTH_STATUS_FIXTURE_AUTHED,
        } satisfies Partial<useConfigModule.Config> as useConfigModule.Config)
        render(<WelcomeMessage setView={() => {}} />, {
            wrapper: AppWrapperForTest,
        })
        openCollapsiblePanels()

        // Check common elements
        expect(screen.getByText(FIXTURE_PROMPTS[0].name)).toBeInTheDocument()
    })
})
