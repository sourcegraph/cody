import { CodyIDE } from '@sourcegraph/cody-shared'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { AppWrapperForTest } from '../../AppWrapperForTest'
import { WelcomeMessage } from './WelcomeMessage'

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

        // Check elements specific to CodyIDE.VSCode
        expect(screen.getByText(/To add code context from an editor/)).toBeInTheDocument()
        expect(screen.getByText(/Start a new chat using/)).toBeInTheDocument()
        expect(screen.getByText(/Documentation/)).toBeInTheDocument()
        expect(screen.getByText(/Help & Support/)).toBeInTheDocument()
    })

    test('renders for CodyIDE.JetBrains', () => {
        render(<WelcomeMessage IDE={CodyIDE.JetBrains} setView={() => {}} />, {
            wrapper: AppWrapperForTest,
        })
        openCollapsiblePanels()

        // Check common elements
        expect(screen.getByText(/Chat Help/)).toBeInTheDocument()

        // Check elements specific to CodyIDE.JetBrains
        expect(screen.queryByText(/To add code context from an editor/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Start a new chat using/)).not.toBeInTheDocument()
        expect(screen.getByText(/Documentation/)).toBeInTheDocument()
        expect(screen.getByText(/Help & Support/)).toBeInTheDocument()
    })
})
