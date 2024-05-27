import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { WelcomeMessage, localStorageKey } from './WelcomeMessage'

beforeEach(() => {
    window.localStorage.removeItem(localStorageKey)
})

afterEach(() => {
    window.localStorage.removeItem(localStorageKey)
})

describe('WelcomeMessage', () => {
    test('renders', () => {
        render(<WelcomeMessage />)

        // Initial render
        expect(screen.getByText(/Customize chat settings/)).toBeInTheDocument()

        // Close it
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(screen.getByRole('button', { name: 'Cody Chat Help' })).toBeInTheDocument()
        expect(window.localStorage.getItem(localStorageKey)).toBe('true')

        // Reopen it
        fireEvent.click(screen.getByRole('button', { name: 'Cody Chat Help' }))
        expect(screen.getByText(/Customize chat settings/)).toBeInTheDocument()
        expect(window.localStorage.getItem(localStorageKey)).toBeNull()
    })

    test('renders as collapsed if localstorage is set', () => {
        window.localStorage.setItem(localStorageKey, 'true')
        render(<WelcomeMessage />)
        expect(screen.getByRole('button', { name: 'Cody Chat Help' })).toBeInTheDocument()
    })
})
