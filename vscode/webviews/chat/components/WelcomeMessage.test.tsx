import { CodyIDE } from '@sourcegraph/cody-shared'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { AppWrapperForTest } from '../../AppWrapperForTest'
import { usePromptsQuery } from '../../components/promptList/usePromptsQuery'
import { FIXTURE_PROMPTS } from '../../components/promptSelectField/fixtures'
import { WelcomeMessage } from './WelcomeMessage'

vi.mock('../../components/promptList/usePromptsQuery')
vi.mocked(usePromptsQuery).mockReturnValue({
    value: {
        query: '',
        commands: [],
        prompts: { type: 'results', results: [FIXTURE_PROMPTS[0]] },
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
        render(<WelcomeMessage IDE={CodyIDE.VSCode} setView={() => {}} />, {
            wrapper: AppWrapperForTest,
        })
        openCollapsiblePanels()

        // Check common elements
        expect(screen.getByText(/Chat Help/)).toBeInTheDocument()
        expect(screen.getByText(FIXTURE_PROMPTS[0].name)).toBeInTheDocument()

        // Check elements specific to CodyIDE.VSCode
        expect(screen.getByText(/To add code context from an editor/)).toBeInTheDocument()
        expect(screen.getByText(/Start a new chat using/)).toBeInTheDocument()
        expect(screen.getByText(/Customize chat settings/)).toBeInTheDocument()
    })

    test('renders for CodyIDE.JetBrains', () => {
        render(<WelcomeMessage IDE={CodyIDE.JetBrains} setView={() => {}} />, {
            wrapper: AppWrapperForTest,
        })
        openCollapsiblePanels()

        // Check common elements
        expect(screen.getByText(/Chat Help/)).toBeInTheDocument()
        expect(screen.getByText(FIXTURE_PROMPTS[0].name)).toBeInTheDocument()

        // Check elements specific to CodyIDE.JetBrains
        expect(screen.queryByText(/To add code context from an editor/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Start a new chat using/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Customize chat settings/)).not.toBeInTheDocument()
    })
})
