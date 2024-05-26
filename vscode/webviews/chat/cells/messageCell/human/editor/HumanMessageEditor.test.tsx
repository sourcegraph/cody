import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { type Assertion, type Mock, describe, expect, test, vi } from 'vitest'
import { AppWrapper } from '../../../../../AppWrapper'
import { serializedPromptEditorStateFromText } from '../../../../../promptEditor/PromptEditor'
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

    describe('states', () => {
        function expectState(
            { container, mentionButton, submitButton }: ReturnType<typeof renderWithMocks>,
            expected: {
                toolbarVisible?: boolean
                submitButtonEnabled?: boolean
                submitButtonText?: string
            }
        ): void {
            if (expected.toolbarVisible !== undefined) {
                notUnless(expect.soft(mentionButton), expected.toolbarVisible).toBeVisible()
                notUnless(expect.soft(submitButton), expected.toolbarVisible).toBeVisible()
            }

            if (expected.submitButtonEnabled !== undefined) {
                notUnless(expect.soft(submitButton), expected.submitButtonEnabled).toBeEnabled()
            }
            if (expected.submitButtonText !== undefined) {
                expect.soft(submitButton).toHaveTextContent(expected.submitButtonText)
            }

            function notUnless<T>(assertion: Assertion<T>, value: boolean): Assertion<T> {
                return value ? assertion : assertion.not
            }
        }

        test('unsent', () => {
            expectState(
                renderWithMocks({
                    initialEditorState: serializedPromptEditorStateFromText('abc'),
                    isSent: false,
                }),
                { toolbarVisible: true, submitButtonEnabled: true, submitButtonText: 'Send' }
            )
        })

        describe('sent pending', () => {
            function renderSentPending(): ReturnType<typeof renderWithMocks> {
                const rendered = renderWithMocks({
                    initialEditorState: serializedPromptEditorStateFromText('abc'),
                    isSent: true,
                    isEditorInitiallyFocused: true,
                    isPendingResponse: true,
                })
                typeInEditor(rendered.editor, 'x')
                fireEvent.keyDown(rendered.editor, ENTER_KEYBOARD_EVENT_DATA)
                return rendered
            }

            test('initial', () => {
                const rendered = renderSentPending()
                expectState(rendered, {
                    toolbarVisible: true,
                    submitButtonEnabled: false,
                    submitButtonText: 'Send',
                })
            })
        })

        test('sent complete', () => {
            const rendered = renderWithMocks({
                initialEditorState: undefined,
                isSent: true,
            })
            expectState(rendered, { toolbarVisible: false })

            fireEvent.focus(rendered.editor)
            expectState(rendered, { toolbarVisible: true })
        })
    })

    describe('submitting', () => {
        test('empty editor', () => {
            const { container, submitButton, onSubmit } = renderWithMocks({
                initialEditorState: undefined,
                __test_dontTemporarilyDisableSubmit: true,
            })
            expect(submitButton).toBeDisabled()

            // Click
            fireEvent.click(submitButton!)
            expect(onSubmit).toHaveBeenCalledTimes(0)

            // Enter
            const editor = container.querySelector<HTMLElement>('[data-lexical-editor="true"]')!
            fireEvent.keyDown(editor, ENTER_KEYBOARD_EVENT_DATA)
            expect(onSubmit).toHaveBeenCalledTimes(0)
        })

        test('submit', async () => {
            const { container, submitButton, onSubmit } = renderWithMocks({
                initialEditorState: FILE_MENTION_EDITOR_STATE_FIXTURE,
                __test_dontTemporarilyDisableSubmit: true,
            })
            expect(submitButton).toBeEnabled()

            // Click
            fireEvent.click(submitButton!)
            expect(onSubmit).toHaveBeenCalledTimes(1)
            expect(onSubmit.mock.lastCall[1]).toBe(true) // addEnhancedContext === true

            // Enter
            const editor = container.querySelector<HTMLElement>('[data-lexical-editor="true"]')!
            fireEvent.keyDown(editor, ENTER_KEYBOARD_EVENT_DATA)
            expect(onSubmit).toHaveBeenCalledTimes(2)
            expect(onSubmit.mock.lastCall[1]).toBe(true) // addEnhancedContext === true
        })

        test('submit w/o context', async () => {
            const { container, editor, onSubmit } = renderWithMocks({
                initialEditorState: FILE_MENTION_EDITOR_STATE_FIXTURE,
                __test_dontTemporarilyDisableSubmit: true,
            })
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

type EditorHTMLElement = HTMLDivElement & { dataset: { lexicalEditor: 'true' } }

function typeInEditor(editor: EditorHTMLElement, text: string): void {
    fireEvent.focus(editor)
    fireEvent.click(editor)
    fireEvent.input(editor, { data: text })
}

function renderWithMocks(props: Partial<ComponentProps<typeof HumanMessageEditor>>): {
    container: HTMLElement
    editor: EditorHTMLElement
    mentionButton: HTMLElement | null
    submitButton: HTMLElement | null
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
        isPendingResponse: false,
        isPendingPriorResponse: false,
        isSent: false,
        onChange,
        onSubmit,
    }

    const { container } = render(<HumanMessageEditor {...DEFAULT_PROPS} {...props} />, {
        wrapper: AppWrapper,
    })
    return {
        container,
        editor: container.querySelector<EditorHTMLElement>('[data-lexical-editor="true"]')!,
        mentionButton: screen.queryByRole('button', { name: 'Add context', hidden: true }),
        submitButton: screen.queryByRole('button', {
            name: 'Send with automatic code context',
            hidden: true,
        }),
        onChange,
        onSubmit,
    }
}
