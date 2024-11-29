import { describe, test, expect } from 'vitest'
import { editorMachine, schema } from './editor'
import { type ActorRefFrom, createActor } from 'xstate'
import type { Node } from 'prosemirror-model'
import { Selection } from 'prosemirror-state'
import { ContextItemSource, type SerializedContextItem, } from '@sourcegraph/cody-shared'

function createEditor(value: (string|SerializedContextItem)[]): ActorRefFrom<typeof editorMachine> {
    let nodes: Node[] = []
    for (const item of value) {
        if (typeof item === 'string') {
            nodes.push(schema.text(item))
        } else {
            nodes.push(schema.node('mention', { item }, [schema.text(item.uri.toString())]))
        }
    }

    const editor = createActor(editorMachine, { input: { initialDocument: schema.node('doc', null, schema.node('paragraph', null, nodes)) }})
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

function getText(editor: ActorRefFrom<typeof editorMachine>) {
    const state = editor.getSnapshot().context.editorState
    return state.doc.textBetween(0, Selection.atEnd(state.doc).from)
}

describe('addMentions', () => {
    test('append', () => {
        const editor = createEditor(['before ', createMention('file1'), ' after'])
        editor.send({type: 'mentions.add', items: [createMention('file2'),createMention('file3')], position: 'after', separator: ' ! '})

        expect(getText(editor)).toMatchInlineSnapshot(`"before file1 after file2 ! file3 ! "`)
    })

    test('prepend', () => {
        const editor = createEditor(['before ', createMention('file1'), ' after'])
        editor.send({type: 'mentions.add', items: [createMention('file2'),createMention('file3')], position: 'before', separator: ' ! '})

        expect(getText(editor)).toMatchInlineSnapshot(`"file2 ! file3 ! before file1 after"`)
    })

    test('update mention', () => {
        const editor = createEditor(['before ', createMention('file1', [1,5]),' ', createMention('file2', [0,5]), ' after'])
        editor.send({type: 'mentions.add', items: [createMention('file1', [0,6]), createMention('file2', [4,10])], position: 'after', separator: ' ! '})

        expect(getText(editor)).toMatchInlineSnapshot(`"before  file2:1-11 after file1:1-7 ! "`)
    })
})

test('filterMentions', () => {
        const editor = createEditor(['one ', createMention('file1'), ' two ', createMention('file2'), ' three'])
        editor.send({type: 'mentions.filter', filter: item => item.uri === 'file1'})
        expect(getText(editor)).toMatchInlineSnapshot(`"one file1 two  three"`)
})
