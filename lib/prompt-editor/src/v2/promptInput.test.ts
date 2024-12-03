import { describe, test, expect, vi, beforeEach } from 'vitest'
import { DataLoaderInput, promptInput, schema } from './promptInput'
import { type ActorRefFrom, createActor, fromCallback, SimulatedClock } from 'xstate'
import type { Node } from 'prosemirror-model'
import { Selection } from 'prosemirror-state'
import { ContextItemSource, type SerializedContextItem, } from '@sourcegraph/cody-shared'
import { enableAtMention } from './atMention'

type PromptInputActor = ActorRefFrom<typeof promptInput>

const fetchMenuData = vi.fn((_args: {input: DataLoaderInput}): void => {})
const clock = new SimulatedClock()

function createInput(value: (string|SerializedContextItem)[]): ActorRefFrom<typeof promptInput> {
    let nodes: Node[] = []
    for (const item of value) {
        if (typeof item === 'string') {
            nodes.push(schema.text(item))
        } else {
            nodes.push(schema.node('mention', { item, isFromInitialContext: true }, [schema.text(item.uri.toString())]))
        }
    }

    const editor = createActor(promptInput.provide({actors: {fetchMenuData: fromCallback(fetchMenuData)}}), { input: { initialDocument: schema.node('doc', null, schema.node('paragraph', null, nodes)) }, clock})
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
        range: range ? { start: { line: range[0], character: 0}, end: { line: range[1], character: 0} } : undefined,
        source: ContextItemSource.User,
    }
}

function getText(editor: PromptInputActor): string {
    const state = editor.getSnapshot().context.editorState
    return state.doc.textBetween(0, Selection.atEnd(state.doc).from , '<>')
}

function createAtMention(mention: `@${string}`): (editor: PromptInputActor) => void {
    return editor => {
        editor.send({type: 'dispatch', transaction: enableAtMention(editor.getSnapshot().context.editorState.tr.insertText('@'))})
        const tr = editor.getSnapshot().context.editorState.tr
        editor.send({type: 'dispatch', transaction: tr.insertText(mention.slice(1)).setSelection(Selection.atEnd(tr.doc))})
    }
}

beforeEach(() => {
    fetchMenuData.mockRestore()
    clock.set(0)
})

describe('addMentions', () => {
    test('append', () => {
        const input = createInput(['before ', cm('file1'), ' after'])
        input.send({type: 'mentions.add', items: [cm('file2'),cm('file3')], position: 'after', separator: ' ! '})

        expect(getText(input)).toMatchInlineSnapshot(`"before file1 after file2 ! file3 ! "`)
    })

    test('prepend', () => {
        const input = createInput(['before ', cm('file1'), ' after'])
        input.send({type: 'mentions.add', items: [cm('file2'),cm('file3')], position: 'before', separator: ' ! '})

        expect(getText(input)).toMatchInlineSnapshot(`"file2 ! file3 ! before file1 after"`)
    })

    test('update mention', () => {
        const input = createInput(['before ', cm('file1', [3,5]),' ', cm('file2', [0,5]), ' after'])
        input.send({type: 'mentions.add', items: [cm('file1', [0,6]), cm('file2', [4,10])], position: 'after', separator: ' ! '})

        expect(getText(input)).toMatchInlineSnapshot(`"before  file2:1-10 after file1:1-6 ! "`)
    })
})

test('filterMentions', () => {
    const editor = createInput(['1 ', cm('file1'), ' 2 ', cm('file2'), ' 3 ', cm('file3')])
    editor.send({type: 'mentions.filter', filter: item => item.uri === 'file2'})
    expect(getText(editor)).toMatchInlineSnapshot(`"1  2 file2 3 "`)
})

describe('set initial mentions' , () => {
    test('with only initial mentions', () => {
        const editor = createInput([cm('file1'), ' ', cm('file2')])
        editor.send({type: 'mentions.setInitial', items: [cm('file3'), cm('file4')]})
        expect(getText(editor)).toMatchInlineSnapshot(`"file3 file4 "`)
        expect(editor.getSnapshot().context.editorState.doc.childCount, 'document has only single paragraph').toBe(1)

        editor.send({type: 'mentions.setInitial', items: [cm('file5'), cm('file6')]})
        expect(getText(editor), 'updates mentions because there are only initial ones').toMatchInlineSnapshot(`"file5 file6 "`)
    })

    test('with other text', () => {
        const editor = createInput(['some text'])
        editor.send({type: 'mentions.setInitial', items: [cm('file1'), cm('file2')]})
        expect(getText(editor)).toMatchInlineSnapshot(`"file1 file2 some text"`)

        editor.send({type: 'mentions.setInitial', items: [cm('file3'), cm('file4')]})
        expect(getText(editor), 'does not update existing initial mentions').toMatchInlineSnapshot(`"file1 file2 some text"`)
    })
})

describe('mention menu', () => {
    test('calls fetch function and updates available items', () => {
        fetchMenuData.mockImplementation(({input}) => {
            input.parent.send({type: 'suggestions.results.set', data: [{data: cm('file1')}, {data: cm('file2')}]})
        })

        const editor = createInput(['test '])
        createAtMention('@file')(editor)
        const state = editor.getSnapshot()
        clock.increment(300)

        expect(fetchMenuData).toHaveBeenCalledTimes(1)
        //const state = editor.getSnapshot()
        expect(state.context.suggestions.items).toHaveLength(2)
        expect(state.context.suggestions.filter).toBe('@file')
    })
})
