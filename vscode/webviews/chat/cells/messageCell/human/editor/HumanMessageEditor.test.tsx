import {
    FILE_MENTION_EDITOR_STATE_FIXTURE,
    FIXTURE_MODELS,
    serializedPromptEditorStateFromText,
} from '@sourcegraph/cody-shared'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { type Assertion, type Mock, describe, expect, test, vi } from 'vitest'
import { AppWrapperForTest } from '../../../../../AppWrapperForTest'
import { FIXTURE_USER_ACCOUNT_INFO } from '../../../../fixtures'
import { HumanMessageEditor } from './HumanMessageEditor'

const ENTER_KEYBOARD_EVENT_DATA: Pick<KeyboardEvent, 'key' | 'code' | 'keyCode'> = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
}

describe('HumanMessageEditor', () => {
    test('renders textarea', async () => {
        const { editor } = renderWithMocks({})
        expect(editor).toHaveTextContent('What does Symbol1')
    })

    describe('states', () => {
        function expectState(
            { toolbar, submitButton }: ReturnType<typeof renderWithMocks>,
            expected: {
                toolbarVisible?: boolean
                submitButtonVisible?: boolean
                submitButtonEnabled?: boolean
                submitButtonText?: string | RegExp
            }
        ): void {
            if (expected.toolbarVisible !== undefined) {
                notUnless(expect.soft(toolbar), expected.toolbarVisible).toBeVisible()
            }
            if (expected.submitButtonVisible !== undefined) {
                notUnless(expect.soft(submitButton), expected.submitButtonVisible).toBeVisible()
            }
            if (expected.submitButtonEnabled !== undefined) {
                notUnless(expect.soft(submitButton), expected.submitButtonEnabled).toBeEnabled()
            }
            if (expected.submitButtonText !== undefined) {
                expect.soft(submitButton).toHaveAccessibleName(expected.submitButtonText)
            }

            function notUnless<T>(assertion: Assertion<T>, value: boolean): Assertion<T> {
                return value ? assertion : assertion.not
            }
        }

        test('!isSent', () => {
            expectState(
                renderWithMocks({
                    initialEditorState: serializedPromptEditorStateFromText('abc'),
                    isSent: false,
                }),
                {
                    toolbarVisible: true,
                    submitButtonEnabled: true,
                    submitButtonText: /send/i,
                }
            )
        })

        test('isSent && !isPendingResponse', () => {
            const rendered = renderWithMocks({
                initialEditorState: undefined,
                isSent: true,
            })
            expectState(rendered, { toolbarVisible: false })
            fireEvent.focus(rendered.editor)
            expectState(rendered, { toolbarVisible: true })
        })

        test('isPendingPriorResponse', () => {
            expectState(
                renderWithMocks({
                    initialEditorState: undefined,
                    isPendingPriorResponse: true,
                }),
                {
                    toolbarVisible: true,
                    submitButtonEnabled: true,
                    submitButtonText: /stop/i,
                }
            )
        })
    })

    describe('submitting', () => {
        test('empty editor', () => {
            const { submitButton, editor, onSubmit } = renderWithMocks({
                initialEditorState: FILE_MENTION_EDITOR_STATE_FIXTURE,
            })
            expect(submitButton).toBeEnabled()

            // Click
            fireEvent.click(submitButton!)
            expect(onSubmit).toHaveBeenCalledTimes(1)

            // Enter
            fireEvent.keyDown(editor, ENTER_KEYBOARD_EVENT_DATA)
            expect(onSubmit).toHaveBeenCalledTimes(2)
        })

        test('isPendingPriorResponse', () => {
            const { submitButton, onStop } = renderWithMocks({
                initialEditorState: serializedPromptEditorStateFromText('abc'),
                isPendingPriorResponse: true,
            })

            expect(submitButton).toBeEnabled()

            // Click
            fireEvent.click(submitButton!)
            expect(onStop).toHaveBeenCalledTimes(1)
        })

        test('submit', async () => {
            const { submitButton, editor, onSubmit } = renderWithMocks({
                initialEditorState: FILE_MENTION_EDITOR_STATE_FIXTURE,
            })
            expect(submitButton).toBeEnabled()

            // Click
            fireEvent.click(submitButton!)
            expect(onSubmit).toHaveBeenCalledTimes(1)

            // Enter
            fireEvent.keyDown(editor, ENTER_KEYBOARD_EVENT_DATA)
            expect(onSubmit).toHaveBeenCalledTimes(2)
        })

        test('model selector is showing up with the default model name', () => {
            const { container } = renderWithMocks({})
            const tabsBar = container.querySelector('[class*="tabsRoot"]')
            const modelSelector = tabsBar?.querySelector('[data-testid="chat-model-selector"]')
            expect(modelSelector).not.toBeNull()
        })
    })
})

type EditorHTMLElement = HTMLDivElement & {
    dataset: { lexicalEditor: 'true' }
}

function renderWithMocks(props: Partial<ComponentProps<typeof HumanMessageEditor>>): {
    container: HTMLElement
    editor: EditorHTMLElement
    toolbar: HTMLElement | null
    submitButton: HTMLElement | null
    onChange: Mock
    onSubmit: Mock
    onStop: Mock
} {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    const onStop = vi.fn()
    const manuallySelectIntent = vi.fn()

    const DEFAULT_PROPS: React.ComponentProps<typeof HumanMessageEditor> = {
        userInfo: FIXTURE_USER_ACCOUNT_INFO,
        initialEditorState: FILE_MENTION_EDITOR_STATE_FIXTURE,
        placeholder: 'my-placeholder',
        isFirstMessage: true,
        isPendingPriorResponse: false,
        isSent: false,
        onChange,
        onSubmit,
        onStop,
        models: FIXTURE_MODELS,
        manuallySelectIntent,
    }

    const { container } = render(<HumanMessageEditor {...DEFAULT_PROPS} {...props} />, {
        wrapper: AppWrapperForTest,
    })
    return {
        container,
        editor: container.querySelector<EditorHTMLElement>('[data-lexical-editor="true"]')!,
        toolbar: container.querySelector('[data-testid="chat-editor-toolbar"]'),
        submitButton: screen.queryByRole('button', {
            name: /send|stop/i,
            hidden: true,
        }),
        onChange,
        onSubmit,
        onStop,
    }
}
