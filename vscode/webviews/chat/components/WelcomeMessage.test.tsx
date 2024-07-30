import { CodyIDE } from '@sourcegraph/cody-shared'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { WelcomeMessage } from './WelcomeMessage'

describe('WelcomeMessage', () => {
    function openCollapsiblePanels(): void {
        const collapsibleTriggers = screen.getAllByTestId('collapsible-trigger')
        for (const trigger of collapsibleTriggers) {
            fireEvent.click(trigger)
        }
    }
    test('renders for CodyIDE.VSCode', () => {
        render(<WelcomeMessage IDE={CodyIDE.VSCode} />)
        openCollapsiblePanels()

        // Check common elements
        expect(screen.getByText(/Chat Help/)).toBeInTheDocument()
        expect(screen.getByText(/Edit Code/)).toBeInTheDocument()
        expect(screen.getByText(/Document Code/)).toBeInTheDocument()
        expect(screen.getByText(/Explain Code/)).toBeInTheDocument()
        expect(screen.getByText(/Generate Unit Tests/)).toBeInTheDocument()
        expect(screen.getByText(/Find Code Smell/)).toBeInTheDocument()

        // Check elements specific to CodyIDE.VSCode
        expect(screen.getByText(/Custom Commands/)).toBeInTheDocument()
        expect(screen.getByText(/To add code context from an editor/)).toBeInTheDocument()
        expect(screen.getByText(/Start a new chat using/)).toBeInTheDocument()
        expect(screen.getByText(/Customize chat settings/)).toBeInTheDocument()
    })

    test('renders for CodyIDE.JetBrains', () => {
        render(<WelcomeMessage IDE={CodyIDE.JetBrains} />)
        openCollapsiblePanels()

        // Check common elements
        expect(screen.getByText(/Chat Help/)).toBeInTheDocument()
        expect(screen.getByText(/Edit Code/)).toBeInTheDocument()
        expect(screen.getByText(/Document Code/)).toBeInTheDocument()
        expect(screen.getByText(/Explain Code/)).toBeInTheDocument()
        expect(screen.getByText(/Generate Unit Tests/)).toBeInTheDocument()
        expect(screen.getByText(/Find Code Smell/)).toBeInTheDocument()

        // Check elements specific to CodyIDE.JetBrains
        expect(screen.queryByText(/Custom Commands/)).not.toBeInTheDocument()
        expect(screen.queryByText(/To add code context from an editor/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Start a new chat using/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Customize chat settings/)).not.toBeInTheDocument()
    })
})
