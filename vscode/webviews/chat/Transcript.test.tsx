import { type ChatMessage, FIXTURE_MODELS, errorToChatError, ps } from '@sourcegraph/cody-shared'
import { fireEvent, getQueriesForElement, render as render_, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { AppWrapperForTest } from '../AppWrapperForTest'
import { MockNoGuardrails } from '../utils/guardrails'
import { type Interaction, Transcript, transcriptToInteractionPairs } from './Transcript'
import { FIXTURE_USER_ACCOUNT_INFO } from './fixtures'

const PROPS: Omit<ComponentProps<typeof Transcript>, 'transcript'> = {
    messageInProgress: null,
    copyButtonOnSubmit: () => {},
    insertButtonOnSubmit: () => {},
    userInfo: FIXTURE_USER_ACCOUNT_INFO,
    chatEnabled: true,
    postMessage: () => {},
    models: FIXTURE_MODELS,
    setActiveChatContext: () => {},
    manuallySelectedIntent: undefined,
    setManuallySelectedIntent: () => {},
    guardrails: new MockNoGuardrails(),
}

vi.mock('../utils/VSCodeApi', () => ({
    getVSCodeAPI: vi.fn().mockReturnValue({
        onMessage: () => {},
        postMessage: () => {},
    }),
}))

function render(element: JSX.Element): ReturnType<typeof render_> {
    return render_(element, { wrapper: AppWrapperForTest })
}

describe('Transcript', () => {
    test('empty', () => {
        render(<Transcript {...PROPS} transcript={[]} />)
        expectCells([{ message: '' }])
    })

    test('renders with provided models', () => {
        const { container } = render(
            <Transcript
                {...PROPS}
                transcript={[
                    { speaker: 'human', text: ps`Hello`, intent: null },
                    { speaker: 'assistant', text: ps`Hi` },
                ]}
            />
        )

        // Check if the model selector is rendered
        const modelSelector = container.querySelector('[data-testid="chat-model-selector"]')
        expect(modelSelector).not.toBeNull()
        expect(modelSelector?.textContent).toEqual(FIXTURE_MODELS[0].title)

        // Open the menu on click
        fireEvent.click(modelSelector!)
        const modelPopover = container?.querySelectorAll('[data-testid="chat-model-popover"]')[0]
        const modelOptions = modelPopover!.querySelectorAll('[data-testid="chat-model-popover-option"]')
        expect(modelOptions).toHaveLength(FIXTURE_MODELS.length + 1) // Plus 1 for the Document

        // Check if the model titles are correct
        const modelTitles = Array.from(modelOptions!).map(option => option.textContent)
        expect(modelTitles.some(title => title === FIXTURE_MODELS[0].title)).toBe(true)
    })

    test('interaction without context', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    { speaker: 'human', text: ps`Hello`, intent: null },
                    { speaker: 'assistant', text: ps`Hi` },
                ]}
            />
        )
        expectCells([
            { message: 'Hello' },
            { context: { files: 0 } },
            { message: 'Hi' },
            { message: '' },
        ])
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
                        intent: null,
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
            { context: {} },
            { message: 'Bar' },
            { message: 'Baz' },
            { context: {} },
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
            { message: '', canSubmit: true },
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
            { message: '', canSubmit: true },
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
            { context: {} },
            { message: { loading: true } },
            { message: '', canSubmit: true },
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
            { message: '', canSubmit: true },
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
        expectCells([
            { message: 'Foo' },
            { context: {} },
            { message: 'Bar' },
            { message: '', canSubmit: true },
        ])
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
        expectCells([{ message: 'Foo' }, { context: {} }, { message: 'Request Failed: some error' }])
    })

    test('does not clobber user input into followup while isPendingPriorResponse when it completes', async () => {
        const humanMessage: ChatMessage = { speaker: 'human', text: ps`Foo`, contextFiles: [] }
        const assistantMessage: ChatMessage = { speaker: 'assistant', text: ps`Bar` }
        const { container, rerender } = render(
            <Transcript {...PROPS} transcript={[humanMessage]} messageInProgress={assistantMessage} />
        )
        const editor = container.querySelector<EditorHTMLElement>(
            '[role="row"]:last-child [data-lexical-editor="true"]'
        )! as EditorHTMLElement
        await typeInEditor(editor, 'qux')
        expectCells([
            { message: 'Foo' },
            { context: {} },
            { message: 'Bar' },
            { message: 'qux', canSubmit: true },
        ])

        rerender(
            <Transcript
                {...PROPS}
                transcript={[humanMessage, assistantMessage]}
                messageInProgress={null}
            />
        )
        await typeInEditor(editor, 'yap')
        expectCells(
            [
                { message: 'Foo' },
                { context: {} },
                { message: 'Bar' },
                { message: 'qux', canSubmit: true },
            ],
            container
        )
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
        expectCells([
            { message: 'Foo' },
            { context: {} },
            { message: 'Bar' },
            { message: 'xyz', canSubmit: true },
        ])
    })

    test('non-last human message with isPendingPriorResponse', () => {
        // Set up a transcript with multiple messages
        const transcript: ChatMessage[] = [
            { speaker: 'human' as const, text: ps`First question`, intent: null },
            { speaker: 'assistant' as const, text: ps`First answer` },
            { speaker: 'human' as const, text: ps`Second question`, intent: null },
        ]

        // Create a message in progress for the second human message
        const messageInProgress: ChatMessage = {
            speaker: 'assistant' as const,
            text: ps`Second answer in progress`,
        }

        // Render the component with our setup
        const { container } = render(
            <Transcript {...PROPS} transcript={transcript} messageInProgress={messageInProgress} />
        )

        // The second human message should show as pending
        expectCells([
            { message: 'First question' },
            { context: {} },
            { message: 'First answer' },
            { message: 'Second question' },
            { context: {} },
            { message: 'Second answer in progress' },
            { message: '', canSubmit: true },
        ])

        // Verify that the submit button for the followup is disabled when there's a pending response
        const submitButtons = container.querySelectorAll('button[type="submit"]')
        expect(submitButtons).toHaveLength(3) // One button per editor per message.
        expect(submitButtons[0]).toBeEnabled()
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
function expectCells(expectedCells: CellMatcher[], containerElement?: HTMLElement): void {
    const container = containerElement ? getQueriesForElement(containerElement) : screen
    const actualCells = container.getAllByRole('row')
    expect(actualCells).toHaveLength(expectedCells.length)
    for (const [i, cell] of actualCells.entries()) {
        const expectedCell = expectedCells[i]
        if ('message' in expectedCell) {
            expect(cell).toHaveAttribute('data-testid', 'message')
            if (typeof expectedCell.message === 'string') {
                const textElement =
                    cell.querySelector<HTMLDivElement>('[data-lexical-editor]') ??
                    cell.querySelector<HTMLDivElement>('[data-testid="chat-message-content"]') ??
                    cell
                expect(textElement.innerText.trim()).toBe(expectedCell.message)
            } else if ('loading' in expectedCell.message) {
                const statusElement = cell.querySelector('[role="status"]')
                if (i === expectedCells.length - 1) {
                    expect(statusElement).not.toBeNull()
                    expect(statusElement).toHaveAttribute('aria-busy', 'true')
                } else {
                    expect(statusElement).toBeNull()
                }
            }
            if (expectedCell.canSubmit !== undefined) {
                const submitButton = cell.querySelector('button[type="submit"]')
                expect(submitButton).not.toBeNull() // First assert that the button exists
                if (expectedCell.canSubmit) {
                    expect(submitButton).toBeEnabled()
                } else {
                    expect(submitButton).toBeDisabled()
                }
            }
        } else if ('context' in expectedCell) {
            expect(cell).toHaveAttribute('data-testid', 'context')
            if (expectedCell.context.files !== undefined) {
                expect(cell.querySelector('button')).toHaveAccessibleDescription(
                    expectedCell.context.files === 1
                        ? `${expectedCell.context.files} item`
                        : `${expectedCell.context.files} items`
                )
            } else if (expectedCell.context.loading) {
                const statusElement = cell.querySelector('[role="status"]')
                expect(statusElement).not.toBeNull()
                expect(statusElement).toHaveAttribute('aria-busy', 'true')
            }
        } else {
            throw new Error('unknown cell')
        }
    }
}

describe('transcriptToInteractionPairs', () => {
    test('empty transcript', () => {
        expect(transcriptToInteractionPairs([], null, null)).toEqual<Interaction[]>([
            {
                humanMessage: { index: 0, speaker: 'human', isUnsentFollowup: true, intent: null },
                assistantMessage: null,
            },
        ])
    })

    test('finished response pairs', () => {
        expect(
            transcriptToInteractionPairs(
                [
                    { speaker: 'human', text: ps`a` },
                    { speaker: 'assistant', text: ps`b` },
                    { speaker: 'human', text: ps`c` },
                    { speaker: 'assistant', text: ps`d` },
                ],
                null,
                null
            )
        ).toEqual<Interaction[]>([
            {
                humanMessage: {
                    index: 0,
                    speaker: 'human',
                    text: ps`a`,
                    isUnsentFollowup: false,
                    intent: null,
                },
                assistantMessage: {
                    index: 1,
                    speaker: 'assistant',
                    text: ps`b`,
                    isLoading: false,
                },
            },
            {
                humanMessage: {
                    index: 2,
                    speaker: 'human',
                    text: ps`c`,
                    isUnsentFollowup: false,
                    intent: null,
                },
                assistantMessage: {
                    index: 3,
                    speaker: 'assistant',
                    text: ps`d`,
                    isLoading: false,
                },
            },
            {
                humanMessage: { index: 4, speaker: 'human', isUnsentFollowup: true, intent: null },
                assistantMessage: null,
            },
        ])
    })

    test('assistant message is loading', () => {
        expect(
            transcriptToInteractionPairs(
                [{ speaker: 'human', text: ps`a` }],
                {
                    speaker: 'assistant',
                    text: ps`b`,
                },
                null
            )
        ).toEqual<Interaction[]>([
            {
                humanMessage: {
                    index: 0,
                    speaker: 'human',
                    text: ps`a`,
                    isUnsentFollowup: false,
                    intent: null,
                },
                assistantMessage: {
                    index: 1,
                    speaker: 'assistant',
                    text: ps`b`,
                    isLoading: true,
                },
            },
            {
                humanMessage: { index: 2, speaker: 'human', isUnsentFollowup: true, intent: null },
                assistantMessage: null,
            },
        ])
    })

    test('last assistant message is error', () => {
        const error = errorToChatError(new Error('x'))
        expect(
            transcriptToInteractionPairs(
                [{ speaker: 'human', text: ps`a` }],
                {
                    speaker: 'assistant',
                    error,
                },
                null
            )
        ).toEqual<Interaction[]>([
            {
                humanMessage: {
                    index: 0,
                    speaker: 'human',
                    text: ps`a`,
                    isUnsentFollowup: false,
                    intent: null,
                },
                assistantMessage: {
                    index: 1,
                    speaker: 'assistant',
                    error,
                    isLoading: false,
                },
            },
        ])
    })
})
