import { errorToChatError } from '@sourcegraph/cody-shared'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'
import { Transcript } from './Transcript'
import { FIXTURE_USER_ACCOUNT_INFO } from './fixtures'

const PROPS: Omit<ComponentProps<typeof Transcript>, 'transcript'> = {
    messageInProgress: null,
    messageBeingEdited: undefined,
    setMessageBeingEdited: () => {},
    feedbackButtonsOnSubmit: () => {},
    copyButtonOnSubmit: () => {},
    insertButtonOnSubmit: () => {},
    userInfo: FIXTURE_USER_ACCOUNT_INFO,
    postMessage: () => {},
}

describe('Transcript', () => {
    test('empty', () => {
        render(<Transcript {...PROPS} transcript={[]} />)
        expectCells([{ message: 'help and tips' }])
    })

    test('interaction without context', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    { speaker: 'human', text: 'Hello' },
                    { speaker: 'assistant', text: 'Hi' },
                ]}
            />
        )
        expectCells([{ message: 'Hello' }, { message: 'Hi' }])
    })

    test('interaction with context', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    {
                        speaker: 'human',
                        text: 'Foo',
                        contextFiles: [{ type: 'file', uri: URI.file('/foo.js') }],
                    },
                    { speaker: 'assistant', text: 'Bar' },
                ]}
            />
        )
        expectCells([{ message: 'Foo' }, { context: { files: 1 } }, { message: 'Bar' }])
    })

    test('2 interactions', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    { speaker: 'human', text: 'Foo' },
                    { speaker: 'assistant', text: 'Bar' },
                    { speaker: 'human', text: 'Baz' },
                    { speaker: 'assistant', text: 'Qux' },
                ]}
            />
        )
        expectCells([{ message: 'Foo' }, { message: 'Bar' }, { message: 'Baz' }, { message: 'Qux' }])
    })

    test('human message waiting for context', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    {
                        speaker: 'human',
                        text: 'Foo',
                        contextFiles: undefined,
                    },
                ]}
                messageInProgress={{ speaker: 'assistant', text: undefined }}
            />
        )
        expectCells([{ message: 'Foo' }, { context: { loading: true } }])
    })

    test('human message with context, waiting for assistant message', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    {
                        speaker: 'human',
                        text: 'Foo',
                        contextFiles: [{ type: 'file', uri: URI.file('/foo.js') }],
                    },
                ]}
                messageInProgress={{ speaker: 'assistant', text: undefined }}
            />
        )
        expectCells([{ message: 'Foo' }, { context: { files: 1 } }, { message: { loading: true } }])
    })

    test('human message with no context, waiting for assistant message', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    {
                        speaker: 'human',
                        text: 'Foo',
                        contextFiles: [],
                    },
                ]}
                messageInProgress={{ speaker: 'assistant', text: undefined }}
            />
        )
        expectCells([{ message: 'Foo' }, { message: { loading: true } }])
    })

    test('human message with context, assistant message in progress', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    {
                        speaker: 'human',
                        text: 'Foo',
                        contextFiles: [{ type: 'file', uri: URI.file('/foo.js') }],
                    },
                ]}
                messageInProgress={{ speaker: 'assistant', text: 'Bar' }}
            />
        )
        expectCells([{ message: 'Foo' }, { context: { files: 1 } }, { message: 'Bar' }])
    })

    test('human message with no context, assistant message in progress', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    {
                        speaker: 'human',
                        text: 'Foo',
                        contextFiles: [],
                    },
                ]}
                messageInProgress={{ speaker: 'assistant', text: 'Bar' }}
            />
        )
        expectCells([{ message: 'Foo' }, { message: 'Bar' }])
    })

    test('assistant message with error', () => {
        render(
            <Transcript
                {...PROPS}
                transcript={[
                    { speaker: 'human', text: 'Foo' },
                    { speaker: 'assistant', error: errorToChatError(new Error('some error')) },
                ]}
            />
        )
        expectCells([{ message: 'Foo' }, { message: 'Request Failed: some error' }])
    })
})

type CellMatcher =
    | {
          message: string | { loading: boolean }
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
}
