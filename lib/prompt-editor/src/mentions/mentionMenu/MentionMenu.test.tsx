import {
    type ContextItem,
    type ContextMentionProviderMetadata,
    type MentionMenuData,
    displayPathBasename,
} from '@sourcegraph/cody-shared'
import { fireEvent, render, screen } from '@testing-library/react'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandLoading,
} from 'cmdk'
import type { ComponentProps, FunctionComponent } from 'react'
import { type Mock, describe, expect, test, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { type PromptEditorConfig, PromptEditorConfigProvider } from '../../config'
import { MentionMenu } from './MentionMenu'

vi.mock('./MentionMenuItem', () => ({
    MentionMenuContextItemContent: ({ item }: { item: ContextItem }) =>
        `item ${item.type} ${displayPathBasename(item.uri)}`,
    MentionMenuProviderItemContent: ({ provider }: { provider: ContextMentionProviderMetadata }) =>
        `provider ${provider.id}`,
}))

const PROVIDER_P1: ContextMentionProviderMetadata = {
    id: 'p1',
    title: 'p1 title',
    queryLabel: 'p1 queryLabel',
    emptyLabel: 'p1 emptyLabel',
}

const PROVIDER_P2: ContextMentionProviderMetadata = {
    id: 'p2',
    title: 'p2 title',
    queryLabel: 'p2 queryLabel',
    emptyLabel: 'p2 emptyLabel',
}

const ITEM_FILE1: ContextItem = {
    type: 'file',
    uri: URI.file('file1.go'),
}

const ITEM_FILE2: ContextItem = {
    type: 'file',
    uri: URI.file('file2.ts'),
}

const PROPS: Pick<
    ComponentProps<typeof MentionMenu>,
    'params' | 'updateMentionMenuParams' | 'setEditorQuery' | 'selectOptionAndCleanUp'
> = {
    params: { query: '', parentItem: null },
    updateMentionMenuParams: () => {},
    setEditorQuery: () => {},
    selectOptionAndCleanUp: () => {},
}

const CONFIG: PromptEditorConfig = {
    commandComponents: {
        Command,
        CommandInput,
        CommandList,
        CommandEmpty,
        CommandGroup,
        CommandItem,
        CommandLoading,
    },
}
const Wrapper: FunctionComponent<{ children: React.ReactNode }> = ({ children }) => (
    <PromptEditorConfigProvider value={CONFIG}>{children}</PromptEditorConfigProvider>
)

describe('MentionMenu', () => {
    describe('initial states', () => {
        describe('all providers', () => {
            test('loading items', () => {
                const { container } = render(
                    <MentionMenu {...PROPS} data={{ items: undefined, providers: [PROVIDER_P1] }} />,
                    { wrapper: Wrapper }
                )
                expectMenu(container, ['>provider p1'])
            })

            test('empty items', () => {
                const { container } = render(
                    <MentionMenu {...PROPS} data={{ items: [], providers: [PROVIDER_P1] }} />,
                    { wrapper: Wrapper }
                )
                expectMenu(container, ['>provider p1'])
            })

            test('empty providers', () => {
                const { container } = render(
                    <MentionMenu {...PROPS} data={{ items: [ITEM_FILE1], providers: [] }} />,
                    { wrapper: Wrapper }
                )
                expectMenu(container, ['>item file file1.go'])
            })

            test('empty items and providers', () => {
                const { container } = render(
                    <MentionMenu
                        {...PROPS}
                        params={{ ...PROPS.params, query: 'q' }}
                        data={{
                            items: [],
                            providers: [],
                        }}
                    />,
                    { wrapper: Wrapper }
                )
                expectMenu(container, ['#No files found'])
            })
        })

        test('with items', () => {
            const { container } = render(
                <MentionMenu
                    {...PROPS}
                    data={{
                        items: [ITEM_FILE1, ITEM_FILE2],
                        providers: [PROVIDER_P1],
                    }}
                />,
                { wrapper: Wrapper }
            )
            expectMenu(container, ['>provider p1', 'item file file1.go', 'item file file2.ts'])
        })

        test('with error', () => {
            const { container } = render(
                <MentionMenu
                    {...PROPS}
                    data={{
                        items: [ITEM_FILE1, ITEM_FILE2],
                        providers: [],
                        error: 'my-error',
                    }}
                />,
                { wrapper: Wrapper }
            )
            expectMenu(container, ['>item file file1.go', 'item file file2.ts', '#Error: my-error'])
        })

        describe('single provider', () => {
            test('no items with query', () => {
                const { container } = render(
                    <MentionMenu
                        {...PROPS}
                        params={{
                            query: 'test',
                            parentItem: PROVIDER_P1,
                        }}
                        data={{
                            items: [],
                            providers: [],
                        }}
                    />,
                    { wrapper: Wrapper }
                )
                expectMenu(container, ['#p1 title', '#p1 emptyLabel'])
            })

            test('no items without query', () => {
                const { container } = render(
                    <MentionMenu
                        {...PROPS}
                        params={{
                            query: '',
                            parentItem: PROVIDER_P1,
                        }}
                        data={{
                            items: [],
                            providers: [],
                        }}
                    />,
                    { wrapper: Wrapper }
                )
                expectMenu(container, ['#p1 title', '#p1 queryLabel'])
            })

            test('with suggested items for empty query', () => {
                const { container } = render(
                    <MentionMenu
                        {...PROPS}
                        params={{
                            query: '',
                            parentItem: PROVIDER_P1,
                        }}
                        data={{
                            items: [ITEM_FILE1],
                            providers: [],
                        }}
                    />,
                    { wrapper: Wrapper }
                )
                expectMenu(container, ['#p1 title', 'item file file1.go'])
            })

            test('with items and non-empty query', () => {
                const { container } = render(
                    <MentionMenu
                        {...PROPS}
                        params={{
                            query: 'q',
                            parentItem: PROVIDER_P1,
                        }}
                        data={{
                            items: [ITEM_FILE1],
                            providers: [],
                        }}
                    />,
                    { wrapper: Wrapper }
                )
                expectMenu(container, ['#p1 title', 'item file file1.go'])
            })

            test('by trigger prefix', () => {
                const { container } = renderWithMocks(
                    { items: [ITEM_FILE1], providers: [] },
                    { parentItem: null, query: '#x' }
                )
                expectMenu(container, ['>item file file1.go'])
            })
        })
    })

    function renderWithMocks(
        data: MentionMenuData,
        params = PROPS.params
    ): {
        updateMentionMenuParams: Mock
        setEditorQuery: Mock
        selectOptionAndCleanUp: Mock
        container: HTMLElement
    } {
        const updateMentionMenuParams = vi.fn()
        const setEditorQuery = vi.fn()
        const selectOptionAndCleanUp = vi.fn()
        const { container } = render(
            <MentionMenu
                {...PROPS}
                data={data}
                updateMentionMenuParams={updateMentionMenuParams}
                setEditorQuery={setEditorQuery}
                selectOptionAndCleanUp={selectOptionAndCleanUp}
            />,
            { wrapper: Wrapper }
        )
        return {
            updateMentionMenuParams,
            setEditorQuery,
            selectOptionAndCleanUp,
            container,
        }
    }

    describe('select provider', () => {
        function doTest(action: (container: HTMLElement) => void) {
            const { updateMentionMenuParams, setEditorQuery, selectOptionAndCleanUp, container } =
                renderWithMocks({ items: [], providers: [PROVIDER_P1] })
            expectMenu(container, ['>provider p1'])
            action(container)
            expect(updateMentionMenuParams).toBeCalledTimes(1)
            expect(updateMentionMenuParams).toBeCalledWith({ parentItem: PROVIDER_P1 })
            expect(setEditorQuery).toBeCalledTimes(0)
            expect(selectOptionAndCleanUp).toBeCalledTimes(0)
        }
        test('click', () => doTest(() => fireEvent.click(screen.getByText('provider p1'))))
        test('keyboard', () =>
            doTest(container => {
                // ArrowDown then ArrowUp is a noop, but do it just to test
                fireEvent.keyDown(container, { key: 'ArrowDown' })
                fireEvent.keyDown(container, { key: 'ArrowUp' })
                fireEvent.keyDown(container, { key: 'Enter' })
            }))
    })

    describe('select item', () => {
        function doTest(action: (container: HTMLElement) => void): void {
            const { updateMentionMenuParams, setEditorQuery, selectOptionAndCleanUp, container } =
                renderWithMocks({ items: [ITEM_FILE1, ITEM_FILE2], providers: [PROVIDER_P1] })
            expectMenu(container, ['provider p1', 'item file file1.go', 'item file file2.ts'])
            action(container)
            expect(updateMentionMenuParams).toBeCalledTimes(0)
            expect(setEditorQuery).toBeCalledTimes(0)
            expect(selectOptionAndCleanUp).toBeCalledTimes(1)
            expect(selectOptionAndCleanUp.mock.lastCall?.[0].item).toEqual(ITEM_FILE1)
        }
        test('click', () => doTest(() => fireEvent.click(screen.getByText('item file file1.go'))))
        test('keyboard', () =>
            doTest(container => {
                fireEvent.keyDown(container, { key: 'ArrowDown' })
                fireEvent.keyDown(container, { key: 'Enter' })
            }))
    })

    test('keyboard navigation', () => {
        const { container } = render(
            <MentionMenu
                {...PROPS}
                data={{ items: [ITEM_FILE1, ITEM_FILE2], providers: [PROVIDER_P1] }}
            />,
            { wrapper: Wrapper }
        )
        expectMenu(container, ['>provider p1', 'item file file1.go', 'item file file2.ts'])
        fireEvent.keyDown(container, { key: 'ArrowDown' })
        expectMenu(container, ['provider p1', '>item file file1.go', 'item file file2.ts'])
        fireEvent.keyDown(container, { key: 'ArrowDown' })
        expectMenu(container, ['provider p1', 'item file file1.go', '>item file file2.ts'])
        fireEvent.keyDown(container, { key: 'ArrowDown' })
        expectMenu(container, ['>provider p1', 'item file file1.go', 'item file file2.ts'])
    })

    test('handle selection when data changes', () => {
        const { container, rerender } = render(
            <MentionMenu
                {...PROPS}
                data={{ items: [ITEM_FILE1, ITEM_FILE2], providers: [PROVIDER_P1, PROVIDER_P2] }}
            />,
            { wrapper: Wrapper }
        )
        fireEvent.keyDown(container, { key: 'ArrowDown' })
        fireEvent.keyDown(container, { key: 'ArrowDown' })
        fireEvent.keyDown(container, { key: 'ArrowDown' })
        expectMenu(container, [
            'provider p1',
            'provider p2',
            'item file file1.go',
            '>item file file2.ts',
        ])

        // Data updates and the selected option is still present. It should remain selected.
        rerender(<MentionMenu {...PROPS} data={{ items: [ITEM_FILE1, ITEM_FILE2], providers: [] }} />)
        expectMenu(container, ['item file file1.go', '>item file file2.ts'])

        // Data updates and the selected option is no longer present. The first option should be
        // selected.
        rerender(<MentionMenu {...PROPS} data={{ items: [ITEM_FILE1], providers: [] }} />)
        expectMenu(container, ['>item file file1.go'])
    })
})

/** A test helper to make it easier to describe an expected {@link MentionMenu}. */
function expectMenu(container: HTMLElement, expectedRows: string[]): void {
    const actualRows = Array.from(
        container.querySelectorAll<HTMLElement>(
            ':is([role=option], [role=progressbar], [cmdk-group-heading], [cmdk-empty])'
        )
    )

    expect.soft(actualRows).toHaveLength(expectedRows.length)
    for (let i = 0; i < Math.max(expectedRows.length, actualRows.length); i++) {
        const { row: expectedRow, isSelected: expectedRowIsSelected } = parseExpectedRow(
            expectedRows.at(i)
        )
        const actualRow = actualRows.at(i)
        const actualRowLabelPrefix = actualRow?.getAttribute('role') !== 'option' ? '#' : ''
        if (actualRow && expectedRow) {
            expect.soft(`${actualRowLabelPrefix}${actualRow.textContent ?? ''}`).toBe(expectedRow)
            if (expectedRowIsSelected) {
                expect.soft(actualRow).toHaveAttribute('aria-selected', 'true')
            }
        } else if (actualRow) {
            expect.fail(
                `Expected no row ${i}, but it is present and has content ${JSON.stringify(
                    actualRow.innerText
                )}`
            )
        } else {
            expect.fail(`Expected row ${i} with content ${JSON.stringify(expectedRow)}`)
        }
    }

    function parseExpectedRow(expectedRow: string | undefined): {
        row: string | undefined
        isSelected: boolean
    } {
        return {
            row: expectedRow?.replace(/^>/, ''),
            isSelected: expectedRow?.startsWith('>') ?? false,
        }
    }
}
