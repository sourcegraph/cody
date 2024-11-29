/**
 * This module contains the logic for the prompt editor. This includes states and event handling but not the UI
 * except for what prosemirror provides.
 */

import { setup, assign, fromCallback, ActorRefFrom, raise, enqueueActions, sendTo } from 'xstate'
import { Node, Schema } from 'prosemirror-model'
import { displayPathBasename, getMentionOperations, type SerializedContextItem } from '@sourcegraph/cody-shared'
import { EditorView, NodeViewConstructor } from 'prosemirror-view'
import { EditorState, Plugin, Selection, Transaction } from 'prosemirror-state'
import { history, undo, redo } from "prosemirror-history"
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { createAtMentionPlugin } from './atMention'

export const schema = new Schema({
    nodes: {
        doc: {
            content: 'block+',
        },
        paragraph: {
            content: 'inline*',
            group: 'block',
            parseDOM: [{tag: 'p'}],
            toDOM() {
                return ['p', 0]
            },
        },
        text: {
            group: 'inline',
        },
        mention: {
            group: 'inline',
            content: 'text*',
            attrs: {
                item: {}
            },
            atom: true,
            inline: true,
            toDOM(node) {
                return ['span', { 'data-context-item': JSON.stringify(node.attrs.item)}, 0]
            },
            parseDOM: [
                {
                    tag: 'span[data-context-item]',
                    node: 'mention',
                    getAttrs(node) {
                        if (node.dataset.contextItem) {
                            return {
                                item: JSON.parse(node.dataset.contextItem),
                            }
                        }
                        return {}
                    },
                },
            ],
        },
    },
})

interface ProseMirrorMachineInput {
    parent: ActorRefFrom<typeof editorMachine>
    initialState: EditorState
    container: HTMLElement|null
    nodeViews?: Record<string, NodeViewConstructor>
}

type ProseMirrorMachineEvent =
    | {type: 'focus'}
    | {type: 'blur'}

const prosemirrorActor = fromCallback<ProseMirrorMachineEvent, ProseMirrorMachineInput>(({receive, input}) => {
    const editor = new EditorView(input.container, {
        state: input.initialState,
        nodeViews: input.nodeViews,
        dispatchTransaction(transaction) {
            input.parent.send({type: 'editor.state.dispatch', transaction})
        },
    })

    const subscription = input.parent.subscribe(state => {
        if (state.context.editorState !== editor.state) {
            editor.updateState(state.context.editorState)
        }
    })

    function doFocus() {
        editor.focus()
        editor.dispatch(editor.state.tr.scrollIntoView())

        // HACK(sqs): Needed in VS Code webviews to actually get it to focus
        // on initial load, for some reason.
        setTimeout(doFocus)
    }

    receive((event) => {
        switch (event.type) {
            case 'focus':
                doFocus()
                break
        }
    })

    return () => {
        subscription.unsubscribe()
        editor.destroy()
    }
})

export const editorMachine = setup({
    types: {
        events: {} as
            | {type: 'setup', parent: HTMLElement, initialDocument?: Node}
            | {type: 'teardown'}
            | {type: 'focus', moveCursorToEnd?: boolean}
            | {type: 'blur'}
            | {type: 'text.append', text: string}
            | {type: 'mentions.add', items: SerializedContextItem[], position: 'before' | 'after', separator: string}
            | {type: 'mentions.filter', filter: (item: SerializedContextItem) => boolean}
            | {type: 'mentions.initial.set', items: SerializedContextItem[]}
            | {type: 'editor.state.dispatch', transaction: Transaction}
        ,
        input: {} as {
            placeholder?: string
            nodeViews?: Record<string, NodeViewConstructor>
            additionalPlugins?: Plugin[]
            initialDocument?: Node
        },
        context: {} as {
            parent: HTMLElement|null,
            editorState: EditorState
            nodeViews?: Record<string, NodeViewConstructor>
        },
    },
    actors: {
        editor: prosemirrorActor,
    },
    actions: {
    },
}).createMachine({
    context: ({input}) => ({
        parent: null,
        placeholder: input.placeholder,
        nodeViews: input.nodeViews,
        additionalPlugins: input.additionalPlugins,
        editorState: EditorState.create({
            // TODO: Make schema configurable
            doc: input.initialDocument,
            schema,
            plugins: [
                // Enable undo/redo
                history(),
                keymap({ 'Mod-z': undo, 'Mod-y': redo }),
                // todo: mentions menu
                ...createAtMentionPlugin(),
                ...(input.additionalPlugins ?? []),
                // Enables basic keybindings for handling cursor movement
                keymap(baseKeymap),
                // Adds a placholder text
                placeholder(input.placeholder ?? ''),
            ],
        }),
    }),
    initial: 'idle',
    states: {
        idle: {
            on: {
                setup: {
                    actions: assign(({event}) => ({
                        parent: event.parent,
                    })),
                    target: 'ready',
                },
            },
        },

        ready: {
            entry: assign({

            }),
            invoke: {
                src: 'editor',
                id: 'editor',
                input: ({context, self}): ProseMirrorMachineInput => ({
                    // @ts-expect-error
                    parent: self,
                    container: context.parent,
                    nodeViews: context.nodeViews,
                    initialState: context.editorState,
                }),
            },
            on: {
                focus: {
                    actions: enqueueActions(({event, context, enqueue}) => {
                        if (event.moveCursorToEnd) {
                            enqueue.raise({type: 'editor.state.dispatch', transaction: context.editorState.tr.setSelection(Selection.atEnd(context.editorState.doc))})
                        }
                        enqueue.sendTo('editor', {type: 'focus'})
                    })
                },
                blur: {
                    actions: sendTo('editor', {type: 'blur'})
                },
                teardown: 'idle',
            },
        },
    },
    on: {
        'editor.state.dispatch': {
            actions: [
                assign({editorState: ({event, context}) => context.editorState.apply(event.transaction)}),
            ],
        },

        'text.append': {
            actions: raise(({context, event}) => {
                const tr = context.editorState.tr
                tr.insertText(`${getWhitespace(tr.doc)}${event.text}`, context.editorState.selection.from)
                tr.setSelection(Selection.atEnd(tr.doc))

                return {
                    type: 'editor.state.dispatch',
                    transaction: tr,
                }
            })
        },

        'mentions.filter': {
            actions: raise(({context, event}) => ({
                type: 'editor.state.dispatch',
                transaction: filterMentions(context.editorState, event.filter),
            }))
        },

        'mentions.add': {
            actions: raise(({context, event}) => ({
                type: 'editor.state.dispatch',
                transaction: addMentions(context.editorState, event.items, event.position, event.separator),
            }))
        },
    },
})

/**
 * A plugin that adds a placeholder to the editor
 */
function placeholder(text: string) {
    const update = (view: EditorView) => {
        if (view.state.doc.textContent) {
            view.dom.removeAttribute('data-placeholder');
        } else {
            view.dom.setAttribute('data-placeholder', text);
        }
    };

    return new Plugin({
        view(view) {
            update(view);

            return { update };
        }
    });
}

function getWhitespace(node: Node): string {
    const needsWhitespaceBefore = !/(^|\s)$/.test(node.textBetween(0, node.content.size))
    return needsWhitespaceBefore ? ' ' : ''
}

function filterMentions(state: EditorState, filter: (item: SerializedContextItem) => boolean): Transaction {
    const tr = state.tr
    state.doc.descendants((node, pos) => {
        if (node.type.name === 'mention') {
            const item = node.attrs.item as SerializedContextItem
            if (!filter(item)) {
                tr.delete(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize))
            }
        }
    })
    return tr
}

function getMentions(doc: Node): SerializedContextItem[] {
    const mentions: SerializedContextItem[] = []
    doc.descendants(node => {
        if (node.type.name === 'mention') {
            mentions.push(node.attrs.item)
            return false
        }
        return true
    })
    return mentions
}

function addMentions(state: EditorState, items: SerializedContextItem[], position: 'before' | 'after', separator: string): Transaction {
    const existingMentions = getMentions(state.doc)
    const operations = getMentionOperations(existingMentions, items)

    const tr = state.tr

    if ((operations.modify.size + operations.delete.size) > 0) {
        state.doc.descendants((node, pos) => {
            if (node.type.name === 'mention') {
                const item = node.attrs.item as SerializedContextItem
                if (operations.delete.has(item)) {
                    tr.delete(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize))
                } else if (operations.modify.has(item)) {
                    const newItem = operations.modify.get(item)
                    if (newItem) {
                        // We use replaceWith instead of setNodeAttribute because we want to update
                        // the text content of the mention node as well.
                        tr.replaceWith(
                            tr.mapping.map(pos),
                            tr.mapping.map(pos + node.nodeSize),
                            createMentionNode(newItem)
                        )
                    }
                }
            }
        })
    }

    if (operations.create.length > 0) {
        const mentionNodes: Node[] = []
        const separatorNode = state.schema.text(separator)
        for (const item of operations.create) {
            mentionNodes.push(createMentionNode(item))
            mentionNodes.push(separatorNode)
        }
        const paragraph = state.schema.nodes.paragraph.create({}, mentionNodes)

        if (position === 'before') {
            tr.insert(Selection.atStart(tr.doc).from, paragraph)
        } else {
            if (getWhitespace(tr.doc)) {
                tr.insertText(' ', Selection.atEnd(tr.doc).from)
            }
            tr.insert(Selection.atEnd(tr.doc).from, paragraph)
        }
    }

    return tr
}

export function createMentionNode(item: SerializedContextItem): Node {
    let text = getItemTitle(item)
    if (item.range) {
        text += `:${item.range.start.line+ 1}`
        if (item.range.end !== item.range.start) {
            text += `-${item.range.end.line + 1}`
        }
    }
    return schema.nodes.mention.create({item}, schema.text(text))
}

function getItemTitle(item: SerializedContextItem): string {
    switch (item.type) {
        case 'symbol':
            return item.title ?? item.symbolName
        default:
            return item.title ?? displayPathBasename(item.uri)

    }
}
