import { describe, test, expect } from 'vitest'
import { promptInput, schema } from './promptInput'
import { type ActorRefFrom, createActor } from 'xstate'
import type { Node } from 'prosemirror-model'
import { Selection } from 'prosemirror-state'
import { ContextItemSource, type SerializedContextItem, } from '@sourcegraph/cody-shared'

function createInput(value: (string|SerializedContextItem)[]): ActorRefFrom<typeof promptInput> {
    let nodes: Node[] = []
    for (const item of value) {
        if (typeof item === 'string') {
            nodes.push(schema.text(item))
        } else {
            nodes.push(schema.node('mention', { item, isFromInitialContext: true }, [schema.text(item.uri.toString())]))
        }
    }

    const editor = createActor(promptInput, { input: { initialDocument: schema.node('doc', null, schema.node('paragraph', null, nodes)) }})
    editor.start()
    return editor
}

function createMention(uri: string, range?: [number, number]): SerializedContextItem {
    return {
        type: 'file',
        uri,
        range: range ? { start: { line: range[0], character: 0}, end: { line: range[1], character: 0} } : undefined,
        source: ContextItemSource.User,
    }
}

function getText(editor: ActorRefFrom<typeof promptInput>) {
    const state = editor.getSnapshot().context.editorState
    return state.doc.textBetween(0, Selection.atEnd(state.doc).from)
}

describe('addMentions', () => {
    test('append', () => {
        const input = createInput(['before ', createMention('file1'), ' after'])
        input.send({type: 'mentions.add', items: [createMention('file2'),createMention('file3')], position: 'after', separator: ' ! '})

        expect(getText(input)).toMatchInlineSnapshot(`"before file1 after file2 ! file3 ! "`)
    })

    test('prepend', () => {
        const input = createInput(['before ', createMention('file1'), ' after'])
        input.send({type: 'mentions.add', items: [createMention('file2'),createMention('file3')], position: 'before', separator: ' ! '})

        expect(getText(input)).toMatchInlineSnapshot(`"file2 ! file3 ! before file1 after"`)
    })

    test('update mention', () => {
        const input = createInput(['before ', createMention('file1', [1,5]),' ', createMention('file2', [0,5]), ' after'])
        input.send({type: 'mentions.add', items: [createMention('file1', [0,6]), createMention('file2', [4,10])], position: 'after', separator: ' ! '})

        expect(getText(input)).toMatchInlineSnapshot(`"before  file2:1-10 after file1:1-6 ! "`)
    })
})

test('filterMentions', () => {
    const editor = createInput(['one ', createMention('file1'), ' two ', createMention('file2'), ' three'])
    editor.send({type: 'mentions.filter', filter: item => item.uri === 'file1'})
    expect(getText(editor)).toMatchInlineSnapshot(`"one file1 two  three"`)
})

describe('set initial mentions' , () => {
    test('with only initial mentions', () => {
        const editor = createInput([createMention('file1'), ' ', createMention('file2')])
        editor.send({type: 'mentions.setInitial', items: [createMention('file3'), createMention('file4')]})
        expect(getText(editor)).toMatchInlineSnapshot(`"file3 file4 "`)

        editor.send({type: 'mentions.setInitial', items: [createMention('file5'), createMention('file6')]})
        expect(getText(editor), 'updates mentions because there are only initial ones').toMatchInlineSnapshot(`"file5 file6 "`)
    })

    test('with other text', () => {
        const editor = createInput(['some text'])
        editor.send({type: 'mentions.setInitial', items: [createMention('file1'), createMention('file2')]})
        expect(getText(editor)).toMatchInlineSnapshot(`"file1 file2 some text"`)

        editor.send({type: 'mentions.setInitial', items: [createMention('file3'), createMention('file4')]})
        expect(getText(editor), 'does not update existing initial mentions').toMatchInlineSnapshot(`"file1 file2 some text"`)
    })
})
