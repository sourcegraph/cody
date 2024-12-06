import {
    type ContextItem,
    ContextItemSource,
    REMOTE_DIRECTORY_PROVIDER_URI,
    REMOTE_FILE_PROVIDER_URI,
    type SerializedContextItem,
} from '@sourcegraph/cody-shared'
import type { Node } from 'prosemirror-model'
import { type EditorState, Selection } from 'prosemirror-state'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { type ActorRefFrom, SimulatedClock, createActor, fromCallback } from 'xstate'
import { enableAtMention, hasAtMention } from './plugins/atMention'
import {
    type DataLoaderInput,
    type MenuItem,
    type PromptInputOptions,
    promptInput,
    schema,
} from './promptInput'

type PromptInputActor = ActorRefFrom<typeof promptInput>

const fetchMenuData = vi.fn((_args: { input: DataLoaderInput }): void => {})
const debounceAtMention = vi.fn(() => 10)
let clock: SimulatedClock

function createInput(
    value: (string | SerializedContextItem)[] = [],
    options?: Partial<PromptInputOptions>
): ActorRefFrom<typeof promptInput> {
    const nodes: Node[] = []
    for (const item of value) {
        if (typeof item === 'string') {
            nodes.push(schema.text(item))
        } else {
            nodes.push(
                schema.node('mention', { item, isFromInitialContext: true }, [
                    schema.text(item.uri.toString()),
                ])
            )
        }
    }

    const editor = createActor(
        promptInput.provide({
            actors: { menuDataLoader: fromCallback(fetchMenuData) },
            delays: { debounceAtMention },
        }),
        {
            input: {
                ...options,
                initialDocument: schema.node('doc', null, schema.node('paragraph', null, nodes)),
            },
            clock,
        }
    )
    editor.start()
    return editor
}

/**
 * Creates a serialized context item.
 */
function cm(uri: string, range?: [number, number]): SerializedContextItem {
    return {
        type: 'file',
        uri,
        range: range
            ? { start: { line: range[0], character: 0 }, end: { line: range[1], character: 0 } }
            : undefined,
        source: ContextItemSource.User,
    }
}

function getEditorState(editor: PromptInputActor): EditorState {
    return editor.getSnapshot().context.editorState
}

function getText(editor: PromptInputActor): string {
    const state = getEditorState(editor)
    return state.doc.textBetween(0, Selection.atEnd(state.doc).from, '<>')
}

/**
 * Simulates the creation of an at-mention and subsequent changes to it.
 */
function createAtMention(editor: PromptInputActor): { type: (value: string) => void } {
    editor.send({
        type: 'dispatch',
        transaction: enableAtMention(getEditorState(editor).tr.insertText('@')),
    })

    let previousState = getEditorState(editor)

    return {
        type(mention: string) {
            if (previousState !== getEditorState(editor)) {
                throw new Error(
                    'Editor state has changed since insertion of at-mention. Cannot continue.'
                )
            }
            editor.send({ type: 'dispatch', transaction: getEditorState(editor).tr.insertText(mention) })

            previousState = getEditorState(editor)
        },
    }
}

function mockFetchMenuDataResult(items: MenuItem[]): void {
    fetchMenuData.mockImplementation(({ input }) => {
        input.parent.send({ type: 'mentionsMenu.results.set', items })
    })
}

beforeEach(() => {
    debounceAtMention.mockRestore()
    fetchMenuData.mockRestore()
    clock = new SimulatedClock()
})

describe('generic document editing', () => {
    test('document.set', () => {
        const editor = createInput(['initial ', cm('file1')])
        editor.send({
            type: 'document.set',
            doc: schema.node('doc', null, schema.node('paragraph', null, [schema.text('new')])),
        })

        expect(getText(editor)).toBe('new')
    })

    test('document.append', () => {
        const editor = createInput(['before ', 'middle'])
        editor.send({ type: 'document.append', text: 'after' })

        expect(getText(editor)).toBe('before middle after')
    })
})

describe('mentions', () => {
    describe('document.mentions.add', () => {
        test('append', () => {
            const input = createInput(['before ', cm('file1'), ' after'])
            input.send({
                type: 'document.mentions.add',
                items: [cm('file2'), cm('file3')],
                position: 'after',
                separator: ' ! ',
            })

            expect(getText(input)).toMatchInlineSnapshot(`"before file1 after file2 ! file3 ! "`)
        })

        test('prepend', () => {
            const input = createInput(['before ', cm('file1'), ' after'])
            input.send({
                type: 'document.mentions.add',
                items: [cm('file2'), cm('file3')],
                position: 'before',
                separator: ' ! ',
            })

            expect(getText(input)).toMatchInlineSnapshot(`"file2 ! file3 ! before file1 after"`)
        })

        test('update mention', () => {
            const input = createInput([
                'before ',
                cm('file1', [3, 5]),
                ' ',
                cm('file2', [0, 5]),
                ' after',
            ])
            input.send({
                type: 'document.mentions.add',
                items: [cm('file1', [0, 6]), cm('file2', [4, 10])],
                position: 'after',
                separator: ' ! ',
            })

            expect(getText(input)).toMatchInlineSnapshot(`"before  file2:1-10 after file1:1-6 ! "`)
        })
    })

    test('document.mentions.filter', () => {
        const editor = createInput(['1 ', cm('file1'), ' 2 ', cm('file2'), ' 3 ', cm('file3')])
        editor.send({ type: 'document.mentions.filter', filter: item => item.uri === 'file2' })
        expect(getText(editor)).toMatchInlineSnapshot(`"1  2 file2 3 "`)
    })

    describe('document.mentions.setInitial', () => {
        test('with only initial mentions', () => {
            const editor = createInput([cm('file1'), ' ', cm('file2')])
            editor.send({ type: 'document.mentions.setInitial', items: [cm('file3'), cm('file4')] })
            expect(getText(editor)).toMatchInlineSnapshot(`"file3 file4 "`)
            expect(getEditorState(editor).doc.childCount, 'document has only single paragraph').toBe(1)

            editor.send({ type: 'document.mentions.setInitial', items: [cm('file5'), cm('file6')] })
            expect(
                getText(editor),
                'updates mentions because there are only initial ones'
            ).toMatchInlineSnapshot(`"file5 file6 "`)
        })

        test('with other text', () => {
            const editor = createInput(['some text'])
            editor.send({ type: 'document.mentions.setInitial', items: [cm('file1'), cm('file2')] })
            expect(getText(editor)).toMatchInlineSnapshot(`"file1 file2 some text"`)

            editor.send({ type: 'document.mentions.setInitial', items: [cm('file3'), cm('file4')] })
            expect(getText(editor), 'does not update existing initial mentions').toMatchInlineSnapshot(
                `"file1 file2 some text"`
            )
        })
    })
})

describe('mentions menu', () => {
    const DEBOUNCE_TIME = 10
    beforeEach(() => {
        debounceAtMention.mockReturnValue(DEBOUNCE_TIME)
    })

    test('calls fetch function and updates available items', () => {
        mockFetchMenuDataResult([
            { type: 'file', uri: URI.parse('file:///file1.txt') },
            { type: 'file', uri: URI.parse('file:///file2.txt') },
        ])

        const editor = createInput(['test '])
        const mention = createAtMention(editor)
        mention.type('file')

        clock.increment(DEBOUNCE_TIME)

        expect.soft(fetchMenuData).toHaveBeenCalledTimes(2)
        expect.soft(fetchMenuData.mock.calls[0][0].input.query).toBe('')
        expect.soft(fetchMenuData.mock.calls[1][0].input.query).toBe('file')

        const state = editor.getSnapshot()
        expect.soft(state.context.mentionsMenu.items).toHaveLength(2)
        expect.soft(state.context.mentionsMenu.query).toBe('file')
    })

    test('debounces fetching of menu data', () => {
        const editor = createInput([])
        const mention = createAtMention(editor)

        expect.soft(fetchMenuData, 'initial fetch is done without debounce').toHaveBeenCalledTimes(1)

        mention.type('fi')
        clock.increment(DEBOUNCE_TIME / 2)

        mention.type('le')
        clock.increment(DEBOUNCE_TIME)

        mention.type('s')
        clock.increment(DEBOUNCE_TIME)

        const expectedQueries = ['', 'file', 'files']
        expect.soft(fetchMenuData, 'fetch is debounced').toHaveBeenCalledTimes(expectedQueries.length)

        expectedQueries.forEach((query, index) => {
            expect
                .soft(fetchMenuData)
                .toHaveBeenNthCalledWith(
                    index + 1,
                    expect.objectContaining({ input: expect.objectContaining({ query }) })
                )
        })
    })

    test('apply normal context item', () => {
        const editor = createInput(['test '])
        const item: ContextItem = {
            type: 'file',
            uri: URI.parse('file:///file.txt'),
        }

        const state = editor.getSnapshot()
        editor.send({ type: 'atMention.apply', item })
        expect(state, 'application is ignored when no @-mention is present').toEqual(
            editor.getSnapshot()
        )

        createAtMention(editor)
        editor.send({ type: 'atMention.apply', item })

        expect(getText(editor)).toBe('test file.txt ')
    })

    test('apply provider', () => {
        let receivedInput: string | undefined
        let receivedProviderID: string | undefined

        fetchMenuData.mockImplementation(({ input }) => {
            receivedInput = input.query
            receivedProviderID = input.context?.id
        })
        const editor = createInput(['test '])
        createAtMention(editor)

        editor.send({
            type: 'atMention.apply',
            item: { id: 'some-provider', title: 'provider', queryLabel: 'query', emptyLabel: 'empty' },
        })

        expect.soft(getText(editor), 'selection is cleared').toBe('test @')

        expect.soft(receivedInput).toBe('')
        expect.soft(receivedProviderID).toBe('some-provider')
        expect(hasAtMention(getEditorState(editor))).toBe(true)
    })

    test('apply large file without range', () => {
        const editor = createInput(['test '])
        createAtMention(editor)

        editor.send({
            type: 'atMention.apply',
            item: { type: 'file', uri: URI.parse('file:///file.txt'), isTooLarge: true },
        })

        expect(getText(editor), 'file name and line range seperator are added').toBe('test @file.txt:')
        expect(hasAtMention(getEditorState(editor))).toBe(true)
    })

    test('apply large file with range', () => {
        const editor = createInput(['test '])
        createAtMention(editor)

        editor.send({
            type: 'atMention.apply',
            item: {
                type: 'file',
                uri: URI.parse('file:///file.txt'),
                isTooLarge: true,
                range: { start: { line: 1, character: 0 }, end: { line: 5, character: 0 } },
            },
        })

        expect(getText(editor), 'file name and line range seperator are added').toBe(
            'test file.txt:2-5 '
        )
        expect(hasAtMention(getEditorState(editor))).toBe(false)
    })

    test('menu items are updated according to currently available context size', () => {
        mockFetchMenuDataResult([
            {
                type: 'file',
                uri: URI.parse('file:///file1.txt'),
                size: 5,
                source: ContextItemSource.User,
            },
            {
                type: 'file',
                uri: URI.parse('file:///file2.txt'),
                size: 2,
                source: ContextItemSource.User,
            },
        ])

        const editor = createInput(
            [
                {
                    type: 'file',
                    uri: 'file:///file1.txt',
                    size: 5,
                },
                ' ',
                {
                    type: 'file',
                    uri: 'file:///file2.txt',
                    size: 3,
                },
                ' ',
            ],
            { contextWindowSizeInTokens: 10 }
        )

        createAtMention(editor)

        let state = editor.getSnapshot()
        expect(state.context.mentionsMenu.items).toEqual([
            expect.objectContaining({ isTooLarge: true }),
            expect.objectContaining({ isTooLarge: false }),
        ])

        // Add another item that increases the total size over the limit
        editor.send({
            type: 'document.mentions.add',
            items: [{ type: 'file', uri: 'file:///file3.txt', size: 5, source: ContextItemSource.User }],
            position: 'before',
            separator: ' ',
        })

        state = editor.getSnapshot()
        expect(state.context.mentionsMenu.items).toEqual([
            expect.objectContaining({ isTooLarge: true }),
            expect.objectContaining({ isTooLarge: true }),
        ])

        // Updating the window size updates menu items too
        editor.send({ type: 'update.contextWindowSizeInTokens', size: 20 })
        state = editor.getSnapshot()
        expect(state.context.mentionsMenu.items).toEqual([
            expect.objectContaining({ isTooLarge: false }),
            expect.objectContaining({ isTooLarge: false }),
        ])
    })
    describe('special cases', () => {
        test('apply remote file', () => {
            const editor = createInput(['test '])
            createAtMention(editor)

            editor.send({
                type: 'atMention.apply',
                item: {
                    type: 'openctx',
                    title: 'some-repo',
                    uri: URI.parse('file:///file.txt'),
                    provider: 'openctx',
                    providerUri: REMOTE_FILE_PROVIDER_URI,
                    mention: {
                        uri: 'file:///file.txt',
                        data: {
                            repoName: 'some-repo',
                        },
                    },
                },
            })

            expect(getText(editor), 'repo name and file seperator are added').toBe('test @some-repo:')
            expect(hasAtMention(getEditorState(editor))).toBe(true)
        })

        test('apply remote directory', () => {
            const editor = createInput(['test '])
            createAtMention(editor)

            editor.send({
                type: 'atMention.apply',
                item: {
                    type: 'openctx',
                    title: 'some-repo',
                    uri: URI.parse('file:///file.txt'),
                    provider: 'openctx',
                    providerUri: REMOTE_DIRECTORY_PROVIDER_URI,
                    mention: {
                        uri: 'file:///file.txt',
                        data: {
                            repoName: 'some-repo',
                        },
                    },
                },
            })

            expect(getText(editor), 'repo name and file seperator are added').toBe('test @some-repo:')
            expect(hasAtMention(getEditorState(editor))).toBe(true)
        })
    })
})
