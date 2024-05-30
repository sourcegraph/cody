import { errorToChatError, ps } from '@sourcegraph/cody-shared'
import { fireEvent, render as render_, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { type Assertion, describe, expect, test, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { TestAppWrapper } from '../AppWrapper'
import { Transcript } from './Transcript'
import { FIXTURE_USER_ACCOUNT_INFO } from './fixtures'

const PROPS: Omit<ComponentProps<typeof Transcript>, 'transcript'> = {
    messageInProgress: null,
    feedbackButtonsOnSubmit: () => {},
    copyButtonOnSubmit: () => {},
    insertButtonOnSubmit: () => {},
    userInfo: FIXTURE_USER_ACCOUNT_INFO,
    postMessage: () => {},
}

vi.mock('@vscode/webview-ui-toolkit/react', () => ({
    VSCodeButton: vi.fn(),
    VSCodeCheckbox: vi.fn(),
}))

vi.mock('../utils/VSCodeApi', () => ({
    getVSCodeAPI: vi.fn().mockReturnValue({ postMessage: () => {} }),
}))

function render(element: JSX.Element): ReturnType<typeof render_> {
    return render_(element, { wrapper: TestAppWrapper })
}

describe('Transcript', () => {
    test('empty', () => {
        render(<Transcript {...PROPS} transcript={[]} />)
        expectCells([{ message: '' }])
    })

    test('interaction without context', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    { speaker: 'human', text: ps`Hello` },
                    { speaker: 'assistant', text: ps`Hi` },
                ]}
            />
        )
        expectCells([{ message: 'Hello' }, { message: 'Hi' }, { message: '' }])
    })

    test('interaction with context', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    {
                        speaker: 'human',
                        text: ps`Foo`,
                        contextFiles: [{ type: 'file', uri: URI.file('/foo.js') }],
                    },
                    { speaker: 'assistant', text: ps`Bar` },
                ]}
            />
        )
        expectCells([{ message: 'Foo' }, { context: { files: 1 } }, { message: 'Bar' }, { message: '' }])
    })

    test('2 interactions', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    { speaker: 'human', text: ps`Foo` },
                    { speaker: 'assistant', text: ps`Bar` },
                    { speaker: 'human', text: ps`Baz` },
                    { speaker: 'assistant', text: ps`Qux` },
                ]}
            />
        )
        expectCells([
            { message: 'Foo' },
            { message: 'Bar' },
            { message: 'Baz' },
            { message: 'Qux' },
            { message: '' },
        ])
    })

    test('human message waiting for context', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    {
                        speaker: 'human',
                        text: ps`Foo`,
                        contextFiles: undefined,
                    },
                ]}
                messageInProgress={{ speaker: 'assistant', text: undefined }}
            />
        )
        expectCells([
            { message: 'Foo' },
            { context: { loading: true } },
            { message: '', canSubmit: false },
        ])
    })

    test('human message with context, waiting for assistant message', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    {
                        speaker: 'human',
                        text: ps`Foo`,
                        contextFiles: [{ type: 'file', uri: URI.file('/foo.js') }],
                    },
                ]}
                messageInProgress={{ speaker: 'assistant', text: undefined }}
            />
        )
        expectCells([
            { message: 'Foo' },
            { context: { files: 1 } },
            { message: { loading: true } },
            { message: '', canSubmit: false },
        ])
    })

    test('human message with no context, waiting for assistant message', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    {
                        speaker: 'human',
                        text: ps`Foo`,
                        contextFiles: [],
                    },
                ]}
                messageInProgress={{ speaker: 'assistant', text: undefined }}
            />
        )
        expectCells([
            { message: 'Foo' },
            { message: { loading: true } },
            { message: '', canSubmit: false },
        ])
    })

    test('human message with context, assistant message in progress', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    {
                        speaker: 'human',
                        text: ps`Foo`,
                        contextFiles: [{ type: 'file', uri: URI.file('/foo.js') }],
                    },
                ]}
                messageInProgress={{ speaker: 'assistant', text: ps`Bar` }}
            />
        )
        expectCells([
            { message: 'Foo' },
            { context: { files: 1 } },
            { message: 'Bar' },
            { message: '', canSubmit: false },
        ])
    })

    test('human message with no context, assistant message in progress', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    {
                        speaker: 'human',
                        text: ps`Foo`,
                        contextFiles: [],
                    },
                ]}
                messageInProgress={{ speaker: 'assistant', text: ps`Bar` }}
            />
        )
        expectCells([{ message: 'Foo' }, { message: 'Bar' }, { message: '', canSubmit: false }])
    })

    test('assistant message with error', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    { speaker: 'human', text: ps`Foo` },
                    { speaker: 'assistant', error: errorToChatError(new Error('some error')) },
                ]}
            />
        )
        expectCells([{ message: 'Foo' }, { message: 'Request Failed: some error' }])
    })

    test('does not clobber user input into followup while isPendingPriorResponse when it completes', async () => {
        const { container, rerender } = render(
            <Transcript
                {...PROPS}
                transcript={[{ speaker: 'human', text: ps`Foo`, contextFiles: [] }]}
                messageInProgress={{ speaker: 'assistant', text: ps`Bar` }}
            />
        )
        const editor = container.querySelector<EditorHTMLElement>(
            '[role="row"]:last-child [data-lexical-editor="true"]'
        )! as EditorHTMLElement
        await typeInEditor(editor, 'qux')
        expectCells([{ message: 'Foo' }, { message: 'Bar' }, { message: 'qux', canSubmit: false }])

        rerender(
            <Transcript
                {...PROPS}
                transcript={[
                    { speaker: 'human', text: ps`Foo`, contextFiles: [] },
                    { speaker: 'assistant', text: ps`Bar` },
                ]}
                messageInProgress={null}
            />
        )
        await typeInEditor(editor, 'yap')
        expectCells([{ message: 'Foo' }, { message: 'Bar' }, { message: 'qux', canSubmit: true }])
    })

    test('focus', async () => {
        const { container, rerender } = render(
            <Transcript
                {...PROPS}
                transcript={[
                    { speaker: 'human', text: ps`Foo`, contextFiles: [] },
                    { speaker: 'assistant', text: ps`Bar` },
                ]}
            />
        )

        // Followup initially has the focus.
        const lastEditor = container.querySelector<EditorHTMLElement>(
            '[role="row"]:last-child [data-lexical-editor="true"]'
        )! as EditorHTMLElement
        expect(lastEditor).toHaveFocus()
        await typeInEditor(lastEditor, 'xyz')
        rerender(
            <Transcript
                {...PROPS}
                transcript={[
                    { speaker: 'human', text: ps`Foo`, contextFiles: [] },
                    { speaker: 'assistant', text: ps`Bar` },
                ]}
            />
        )
        expectCells([{ message: 'Foo' }, { message: 'Bar' }, { message: 'xyz', canSubmit: true }])
    })
})

type EditorHTMLElement = HTMLDivElement & { dataset: { lexicalEditor: 'true' } }

async function typeInEditor(editor: EditorHTMLElement, text: string): Promise<void> {
    fireEvent.focus(editor)
    fireEvent.click(editor)
    fireEvent.input(editor, { data: text })
    await new Promise(resolve => setTimeout(resolve))
}

type CellMatcher =
    | {
          message: string | { loading: boolean }
          canSubmit?: boolean
      }
    | {
          context: { files?: number; loading?: boolean }
      }

/** A test helper to make it easier to describe an expected transcript. */
function expectCells(expectedCells: CellMatcher[]): void {
    const actualCells = screen.getAllByRole('row')
    expect(actualCells).toHaveLength(expectedCells.length)
    for (const [i, cell] of actualCells.entries()) {
        const expectedCell = expectedCells[i]
        if ('message' in expectedCell) {
            expect(cell).toHaveAttribute('data-testid', 'message')
            if (typeof expectedCell.message === 'string') {
                expect(cell.innerText).toMatch(expectedCell.message)
            } else if ('loading' in expectedCell.message) {
                expect(cell.querySelector('[role="status"]')).toHaveAttribute('aria-busy')
            }
            if (expectedCell.canSubmit !== undefined) {
                notUnless(
                    expect(cell.querySelector('button[type="submit"]')),
                    expectedCell.canSubmit
                ).toBeEnabled()
            }
        } else if ('context' in expectedCell) {
            expect(cell).toHaveAttribute('data-testid', 'context')
            if (expectedCell.context.files !== undefined) {
                expect(cell.querySelector('summary')).toHaveAccessibleDescription(
                    `${expectedCell.context.files} file`
                )
            } else if (expectedCell.context.loading) {
                expect(cell.querySelector('[role="status"]')).toHaveAttribute('aria-busy')
            }
        } else {
            throw new Error('unknown cell')
        }
    }

    function notUnless<T>(assertion: Assertion<T>, value: boolean): Assertion<T> {
        return value ? assertion : assertion.not
    }
}
