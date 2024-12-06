import { EditorState, TextSelection } from 'prosemirror-state'
import { beforeEach, expect, test } from 'vitest'
import { createAtMentionPlugin, enableAtMention, getAtMentionValue, hasAtMention } from './atMention'
import { schema } from './promptInput'

let state: EditorState

beforeEach(() => {
    state = EditorState.create({
        schema: schema,
        plugins: [...createAtMentionPlugin()],
    })
})

// NOTE: Triggering at mention at '@' character only works with a real DOM.
// Since we don't have that here we trigger the at mention by calling the
// enableAtMention function directly (which otherwise would be triggered by
// the '@' character).

test('create at mention', () => {
    const newState = state.apply(enableAtMention(state.tr.insertText('abc @')))
    expect(hasAtMention(newState)).toBe(true)
})

test('update at mention value', () => {
    let newState = state.apply(enableAtMention(state.tr.insertText('abc @')))

    newState = newState.apply(newState.tr.insertText('foo'))
    expect(getAtMentionValue(newState)).toBe('@foo')

    newState = newState.apply(newState.tr.insertText('bar'))
    expect(getAtMentionValue(newState)).toBe('@foobar')
})

test('disable at mention when selection moves outside', () => {
    let newState = state.apply(enableAtMention(state.tr.insertText('abc @')))

    newState = newState.apply(newState.tr.insertText('foo'))
    expect(hasAtMention(newState)).toBe(true)

    // NOTE: 5 is the position before the '@' character
    newState = newState.apply(newState.tr.setSelection(TextSelection.create(newState.doc, 5)))
    expect(hasAtMention(newState), 'keeps at mention when selection moves to its start').toBe(true)

    newState = newState.apply(newState.tr.setSelection(TextSelection.atStart(newState.doc)))
    expect(hasAtMention(newState), 'removes at mention when selection moves outside').toBe(false)
})

test('disable at mention when space is entered', () => {
    let newState = state.apply(enableAtMention(state.tr.insertText('abc @')))

    newState = newState.apply(newState.tr.insertText('foo'))
    expect(hasAtMention(newState)).toBe(true)

    newState = newState.apply(newState.tr.insertText(' '))
    expect(hasAtMention(newState)).toBe(false)
})
