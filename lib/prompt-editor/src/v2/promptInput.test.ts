import {
    type ContextItem,
    ContextItemSource,
    type ContextMentionProviderMetadata,
    REMOTE_DIRECTORY_PROVIDER_URI,
    REMOTE_FILE_PROVIDER_URI,
    type SerializedContextItem,
} from '@sourcegraph/cody-shared'
import type { Node } from 'prosemirror-model'
import { type EditorState, Selection } from 'prosemirror-state'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { type ActorRefFrom, SimulatedClock, createActor, fromCallback } from 'xstate'
import {
    addMentions,
    appendToDocument,
    filterMentions,
    handleSelectMenuItem,
    setDocument,
    upsertMentions,
} from './actions'
import { AT_MENTION_TRIGGER_CHARACTER, enableAtMention, hasAtMention } from './plugins/atMention'
import {
    type DataLoaderInput,
    type MenuItem,
    type PromptInputOptions,
    getMentions,
    promptInput,
    schema,
} from './promptInput'

type PromptInputActor = ActorRefFrom<typeof promptInput>

const fetchMenuData = vi.fn((_args: { input: DataLoaderInput }): void => {})
const debounceAtMention = vi.fn(() => 10)
let clock: SimulatedClock

/**
 * Tagged template for creating a ProseMirror document.
 */
function documentNode(strings: TemplateStringsArray, ...mentions: SerializedContextItem[]): Node {
    const nodes: Node[] = []
    for (let i = 0; i < strings.length; i++) {
        if (strings[i]) {
            nodes.push(schema.text(strings[i]))
        }
        if (mentions[i]) {
            nodes.push(
                schema.node('mention', { item: mentions[i], isFromInitialContext: true }, [
                    schema.text(mentions[i].uri.toString()),
                ])
            )
        }
    }

    return schema.node('doc', null, schema.node('paragraph', null, nodes))
}
// Convenience shorthand
const d = documentNode

/**
 * Creates a serialized context item. Used together with {@link documentNode}.
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

/**
 * Creates and starts an instance of the prompt input state machine.
 */
function createInput(
    initialDocument: Node,
    options?: Partial<PromptInputOptions>
): ActorRefFrom<typeof promptInput> {
    const editor = createActor(
        promptInput.provide({
            actors: { menuDataLoader: fromCallback(fetchMenuData) },
            delays: { debounceAtMention },
        }),
        {
            input: {
                ...options,
                initialDocument,
            },
            clock,
        }
    )
    editor.start()
    return editor
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
        transaction: enableAtMention(getEditorState(editor).tr.insertText(AT_MENTION_TRIGGER_CHARACTER)),
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

function mockFetchMenu(items: MenuItem[]): (args: { input: DataLoaderInput }) => void {
    return ({ input }) => {
        input.parent.send({ type: 'mentionsMenu.results.set', items })
    }
}

beforeEach(() => {
    debounceAtMention.mockRestore()
    fetchMenuData.mockRestore()
    clock = new SimulatedClock()
})

describe('actions', () => {
    // NOTE: The actions tested here are not part of the state machine itself, but we still want to
    // test in the context of the state machine to have high confidence that everything works well
    // toghether.

    describe('generic document actions', () => {
        test('set document', () => {
            const editor = createInput(d`initial ${cm('file1')}`)
            editor.send({
                type: 'document.update',
                transaction: state => setDocument(state, d`new`),
            })

            expect(getText(editor)).toBe('new')
        })

        test('append to document', () => {
            const editor = createInput(d`before middle`)
            editor.send({
                type: 'document.update',
                transaction: state => appendToDocument(state, 'after'),
            })

            expect(getText(editor)).toBe('before middle after')
        })
    })

    describe('add mentions', () => {
        test('append', () => {
            const input = createInput(d`before ${cm('file1')} after`)
            input.send({
                type: 'document.update',
                transaction: state => addMentions(state, [cm('file2'), cm('file3')], 'after', ' ! '),
            })

            expect(getText(input)).toMatchInlineSnapshot(`"before file1 after file2 ! file3 ! "`)
        })

        test('prepend', () => {
            const input = createInput(d`before ${cm('file1')} after`)
            input.send({
                type: 'document.update',
                transaction: state => addMentions(state, [cm('file2'), cm('file3')], 'before', ' ! '),
            })

            expect(getText(input)).toMatchInlineSnapshot(`"file2 ! file3 ! before file1 after"`)
        })

        test('update mention', () => {
            const input = createInput(d`before ${cm('file1', [3, 5])} ${cm('file2', [0, 5])} after`)
            input.send({
                type: 'document.update',
                transaction: state =>
                    addMentions(state, [cm('file1', [0, 6]), cm('file2', [4, 10])], 'after', ' ! '),
            })

            expect(getText(input)).toMatchInlineSnapshot(`"before  file2:1-10 after file1:1-6 ! "`)
        })
    })

    describe('upsert mentions', () => {
        test('append', () => {
            const input = createInput(d`before ${cm('file1')} after`)
            input.send({
                type: 'document.update',
                transaction: state => upsertMentions(state, [cm('file2'), cm('file3')], 'after', ' ! '),
            })

            expect(getText(input)).toMatchInlineSnapshot(`"before file1 after file2 ! file3 ! "`)
        })

        test('prepend', () => {
            const input = createInput(d`before ${cm('file1')} after`)
            input.send({
                type: 'document.update',
                transaction: state => upsertMentions(state, [cm('file2'), cm('file3')], 'before', ' ! '),
            })

            expect(getText(input)).toMatchInlineSnapshot(`"file2 ! file3 ! before file1 after"`)
        })

        test('update mention', () => {
            const input = createInput(
                d`before ${{
                    type: 'openctx',
                    uri: 'file:///file1.txt',
                    title: 'test',
                    provider: 'openctx',
                    providerUri: REMOTE_FILE_PROVIDER_URI,
                }} after`
            )

            const newMentionData = { uri: 'uri1', data: 1 }
            input.send({
                type: 'document.update',
                transaction: state =>
                    upsertMentions(
                        state,
                        [
                            {
                                type: 'openctx',
                                uri: 'file:///file1.txt',
                                title: '|test updated|',
                                provider: 'openctx',
                                providerUri: REMOTE_FILE_PROVIDER_URI,
                                mention: newMentionData,
                            },
                        ],
                        'after',
                        ' ! '
                    ),
            })

            expect(getText(input)).toMatchInlineSnapshot(`"before |test updated| after"`)
            const state = getEditorState(input)
            expect(getMentions(state.doc)).toEqual([
                expect.objectContaining({ mention: newMentionData }),
            ])
        })
    })

    test('filter', () => {
        const editor = createInput(d`1 ${cm('file1')} 2 ${cm('file2')} 3 ${cm('file3')}`)
        editor.send({
            type: 'document.update',
            transaction: state => filterMentions(state, item => item.uri === 'file2'),
        })

        expect(getText(editor)).toMatchInlineSnapshot(`"1  2 file2 3 "`)
    })

    describe('document.mentions.setInitial', () => {
        test('with only initial mentions', () => {
            const editor = createInput(d`${cm('file1')} ${cm('file2')}`)
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
            const editor = createInput(d`some text`)
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
        fetchMenuData.mockImplementation(
            mockFetchMenu([
                { type: 'file', uri: URI.parse('file:///file1.txt') },
                { type: 'file', uri: URI.parse('file:///file2.txt') },
            ])
        )

        const editor = createInput(d`test`, { handleSelectMenuItem })
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
        const editor = createInput(d``, { handleSelectMenuItem })
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

    describe('apply menu item', () => {
        // NOTE: While the logic for handling menu item selection is not located in the state machine itself (anymore),
        // we still want to test it in the context of the state machine to make to have a high confidence that everything
        // works correctly together.

        test('apply normal context item', () => {
            const editor = createInput(d`test `, { handleSelectMenuItem })
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
            const provider: ContextMentionProviderMetadata = {
                id: 'some-provider',
                title: 'provider',
                queryLabel: 'query',
                emptyLabel: 'empty',
            }
            const item: ContextItem = { type: 'file', uri: URI.parse('file:///file.txt') }
            fetchMenuData
                .mockImplementationOnce(mockFetchMenu([provider]))
                .mockImplementationOnce(mockFetchMenu([provider]))
                .mockImplementationOnce(mockFetchMenu([item]))
            const editor = createInput(d`test `, { handleSelectMenuItem })
            createAtMention(editor).type('file')
            clock.increment(DEBOUNCE_TIME)

            editor.send({
                type: 'mentionsMenu.apply',
                index: 0,
            })

            expect(getText(editor), 'selection is cleared').toBe('test @')

            expect(fetchMenuData).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({ input: expect.objectContaining({ query: 'file' }) })
            )
            expect(fetchMenuData).toHaveBeenNthCalledWith(
                3,
                expect.objectContaining({
                    input: expect.objectContaining({ query: '', context: provider }),
                })
            )

            expect(hasAtMention(getEditorState(editor))).toBe(true)
            expect(editor.getSnapshot().context.mentionsMenu.items).toEqual([item])
        })

        test('apply large file without range', () => {
            const editor = createInput(d`test `, { handleSelectMenuItem })
            createAtMention(editor)

            editor.send({
                type: 'atMention.apply',
                item: { type: 'file', uri: URI.parse('file:///file.txt'), isTooLarge: true },
            })

            expect(getText(editor), 'file name and line range seperator are added').toBe(
                'test @file.txt:'
            )
            expect(hasAtMention(getEditorState(editor))).toBe(true)
        })

        test('apply large file with range', () => {
            const editor = createInput(d`test `, { handleSelectMenuItem })
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
            fetchMenuData.mockImplementation(
                mockFetchMenu([
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
            )

            const editor = createInput(
                d`${{
                    type: 'file',
                    uri: 'file:///file1.txt',
                    size: 5,
                }} ${{
                    type: 'file',
                    uri: 'file:///file2.txt',
                    size: 3,
                }} `,
                { contextWindowSizeInTokens: 10, handleSelectMenuItem }
            )

            createAtMention(editor)

            let state = editor.getSnapshot()
            expect(state.context.mentionsMenu.items).toEqual([
                expect.objectContaining({ isTooLarge: true }),
                expect.objectContaining({ isTooLarge: false }),
            ])

            // Add another item that increases the total size over the limit
            editor.send({
                type: 'document.update',
                transaction: state =>
                    addMentions(
                        state,
                        [
                            {
                                type: 'file',
                                uri: 'file:///file3.txt',
                                size: 5,
                                source: ContextItemSource.User,
                            },
                        ],
                        'before',
                        ' '
                    ),
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
                const editor = createInput(d`test `, { handleSelectMenuItem })
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

                expect(getText(editor), 'repo name and file seperator are added').toBe(
                    'test @some-repo:'
                )
                expect(hasAtMention(getEditorState(editor))).toBe(true)
            })

            test('apply remote directory', () => {
                const editor = createInput(d`test `, { handleSelectMenuItem })
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

                expect(getText(editor), 'repo name and file seperator are added').toBe(
                    'test @some-repo:'
                )
                expect(hasAtMention(getEditorState(editor))).toBe(true)
            })
        })
    })
})
