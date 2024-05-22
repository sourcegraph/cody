import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { type Mock, describe, expect, test, vi } from 'vitest'
import { AppWrapper } from '../../../../../AppWrapper'
import { FILE_MENTION_EDITOR_STATE_FIXTURE } from '../../../../../promptEditor/fixtures'
import { FIXTURE_USER_ACCOUNT_INFO } from '../../../../fixtures'
import { HumanMessageEditor } from './HumanMessageEditor'

vi.mock('@vscode/webview-ui-toolkit/react', () => ({
    VSCodeButton: vi.fn(),
    VSCodeCheckbox: vi.fn(),
}))

const ENTER_KEYBOARD_EVENT_DATA: Pick<KeyboardEvent, 'key' | 'code' | 'keyCode'> = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
}

const ALT_KEYBOARD_EVENT_DATA: Pick<KeyboardEvent, 'key' | 'code' | 'keyCode' | 'altKey'> = {
    key: 'Alt',
    code: 'AltLeft',
    keyCode: 18,
    altKey: true,
}

describe('HumanMessageEditor', () => {
    test('renders textarea', () => {
        renderWithMocks({})
        expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    describe('submitting', () => {
        test('empty editor', () => {
            const { container, submitButton, onSubmit } = renderWithMocks({
                initialEditorState: undefined,
            })
            expect(submitButton).toBeDisabled()

            // Click
            fireEvent.click(submitButton)
            expect(onSubmit).toHaveBeenCalledTimes(0)

            // Enter
            const editor = container.querySelector<HTMLElement>('[data-lexical-editor="true"]')!
            fireEvent.keyDown(editor, ENTER_KEYBOARD_EVENT_DATA)
            expect(onSubmit).toHaveBeenCalledTimes(0)
        })

        test('submit', async () => {
            const { container, submitButton, onSubmit } = renderWithMocks({
                initialEditorState: FILE_MENTION_EDITOR_STATE_FIXTURE,
            })
            expect(submitButton).toBeEnabled()

            // Click
            fireEvent.click(submitButton)
            expect(onSubmit).toHaveBeenCalledTimes(1)
            expect(onSubmit.mock.lastCall[1]).toBe(true) // addEnhancedContext === true

            // Enter
            const editor = container.querySelector<HTMLElement>('[data-lexical-editor="true"]')!
            fireEvent.keyDown(editor, ENTER_KEYBOARD_EVENT_DATA)
            expect(onSubmit).toHaveBeenCalledTimes(2)
            expect(onSubmit.mock.lastCall[1]).toBe(true) // addEnhancedContext === true
        })

        test('submit w/o context', async () => {
            const { container, onSubmit } = renderWithMocks({
                initialEditorState: FILE_MENTION_EDITOR_STATE_FIXTURE,
            })

            const editor = container.querySelector<HTMLElement>('[data-lexical-editor="true"]')!
            fireEvent.focus(editor)

            // Click
            const submitWithoutContextButton = screen.getByRole('button', {
                name: 'Send without automatic code context',
            })
            fireEvent.keyDown(container, ALT_KEYBOARD_EVENT_DATA)
            fireEvent.click(submitWithoutContextButton)
            expect(onSubmit).toHaveBeenCalledTimes(1)
            expect(onSubmit.mock.lastCall[1]).toBe(false) // addEnhancedContext === false

            // Alt+Enter
            fireEvent.keyDown(container, ALT_KEYBOARD_EVENT_DATA)
            fireEvent.keyDown(editor, { ...ENTER_KEYBOARD_EVENT_DATA, altKey: true })
            expect(onSubmit).toHaveBeenCalledTimes(2)
            expect(onSubmit.mock.lastCall[1]).toBe(false) // addEnhancedContext === false
        })
    })
})

function renderWithMocks(props: Partial<ComponentProps<typeof HumanMessageEditor>>): {
    container: HTMLElement
    submitButton: HTMLElement
    onChange: Mock
    onSubmit: Mock
} {
    const onChange = vi.fn()
    const onSubmit = vi.fn()

    const DEFAULT_PROPS: React.ComponentProps<typeof HumanMessageEditor> = {
        userInfo: FIXTURE_USER_ACCOUNT_INFO,
        initialEditorState: FILE_MENTION_EDITOR_STATE_FIXTURE,
        placeholder: 'my-placeholder',
        isFirstMessage: true,
        isSent: false,
        onChange,
        onSubmit,
        isEditorInitiallyFocused: false,
    }

    const { container } = render(<HumanMessageEditor {...DEFAULT_PROPS} {...props} />, {
        wrapper: AppWrapper,
    })
    return {
        container,
        submitButton: screen.getByRole('button', { name: 'Send with automatic code context' }),
        onChange,
        onSubmit,
    }
}
