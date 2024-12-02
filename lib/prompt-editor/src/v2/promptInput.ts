/**
 * This module contains the logic for the prompt editor. This includes states and event handling but not the UI
 * except for what prosemirror provides.
 */

import { setup, assign, fromCallback, ActorRefFrom, enqueueActions, sendTo, fromPromise, PromiseActorLogic } from 'xstate'
import { Node, Schema } from 'prosemirror-model'
import { ContextItem, contextItemMentionNodeDisplayText, ContextMentionProviderMetadata, getMentionOperations, type SerializedContextItem } from '@sourcegraph/cody-shared'
import { EditorView, NodeViewConstructor } from 'prosemirror-view'
import { EditorState, Plugin, Selection, Transaction } from 'prosemirror-state'
import { history, undo, redo } from "prosemirror-history"
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { createAtMentionPlugin, disableAtMention, getAtMentionPosition, getAtMentionValue, hasAtMention, Position } from './atMention'
import type { Item } from './Suggestions'

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
                item: {},
                isFromInitialContext: {default: false},
            },
            atom: true,
            inline: true,
            toDOM(node) {
                return ['span', { 'data-mention-attrs': JSON.stringify(node.attrs)}, 0]
            },
            parseDOM: [
                {
                    tag: 'span[data-mention-attrs]',
                    node: 'mention',
                    getAttrs(node) {
                        if (node.dataset.mentionAttrs) {
                            return JSON.parse(node.dataset.mentionAttrs)
                        }
                        return {}
                    },
                },
            ],
        },
    },
})

interface ProseMirrorMachineInput {
    parent: ActorRefFrom<typeof promptInput>
    initialState: EditorState
    container: HTMLElement|null
    nodeViews?: Record<string, NodeViewConstructor>
}

type ProseMirrorMachineEvent =
    | {type: 'focus'}
    | {type: 'blur'}

/**
 * An actor that manages a ProseMirror editor.
 */
const prosemirrorActor = fromCallback<ProseMirrorMachineEvent, ProseMirrorMachineInput>(({receive, input, system}) => {
    const editor = new EditorView(input.container, {
        state: input.initialState,
        nodeViews: input.nodeViews,
        dispatchTransaction(transaction) {
            input.parent.send({type: 'dispatch', transaction})
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
            case 'blur':
                editor.dom.blur()
                break
        }
    })

    return () => {
        subscription.unsubscribe()
        editor.destroy()
    }
})

type EditorEvents =
    | {type: 'setup', parent: HTMLElement, initialDocument?: Node}
    | {type: 'teardown'}
    | {type: 'focus', moveCursorToEnd?: boolean}
    | {type: 'blur'}
    | {type: 'text.append', text: string}
    | {type: 'mentions.add', items: SerializedContextItem[], position: 'before' | 'after', separator: string}
    | {type: 'mentions.filter', filter: (item: SerializedContextItem) => boolean}
    | {type: 'mentions.setInitial', items: SerializedContextItem[]}
    | {type: 'dispatch', transaction: Transaction}

type SuggestionsEvents =
    | { type: 'suggestions.open', position: Position }
    | { type: 'suggestions.close' }
    | { type: 'suggestions.select.next' }
    | { type: 'suggestions.select.previous' }
    | { type: 'suggestions.filter.update', filter: string, position: Position }
    | { type: 'suggestions.apply', index?: number }

interface PromptInputContext {
    parent: HTMLElement|null,
    editorState: EditorState
    nodeViews?: Record<string, NodeViewConstructor>
    hasSetInitialContext: boolean
    suggestions: {
        filter: string,
        selectedIndex: number,
        items: Item<ContextItem|ContextMentionProviderMetadata>[],
        position: Position,
    },
}

export const promptInput = setup({
    types: {
        events: {} as EditorEvents | SuggestionsEvents,
        input: {} as {
            placeholder?: string
            nodeViews?: Record<string, NodeViewConstructor>
            additionalPlugins?: Plugin[]
            initialDocument?: Node
        },
        context: {} as PromptInputContext,
    },
    actors: {
        editor: prosemirrorActor,
        /**
         * To be provided by the caller
         */
        fetchMenuData: fromPromise<Item<ContextItem|ContextMentionProviderMetadata>[], {query: string}>(async ({}) => {
            return []
        })
    },
    actions: {
        applySelection: ({context, self}) => {
            const selectedItem = context.suggestions.items[context.suggestions.selectedIndex]
            if (!selectedItem) {
                return
            }
            selectedItem.select(context.editorState, tr => self.send({type: 'dispatch', transaction: tr}), selectedItem.data)
        },
        updateEditorState: assign(({context}, params: Transaction) => ({
            editorState: context.editorState.apply(params),
        })),
        /**
         *  Updates the nested suggestions context.
         */
        assignSuggestions: assign(({context}, params: Partial<PromptInputContext['suggestions']>) => ({
            suggestions: {
                ...context.suggestions,
                ...params,
            },
        })),
    },
    guards: {
        isFilterEmpty: ({ context }) => !context.suggestions.filter || context.suggestions.filter.length === 0,
        hasFilterChanged: ({ context }, params: { filter: string }) => {
            return context.suggestions.filter !== params.filter
        },
        canSetInitialMentions: ({ context }) => {
            return !context.hasSetInitialContext ||  isEditorContentOnlyInitialContext(context.editorState)
        },
    },
}).createMachine({
    context: ({input, self}): PromptInputContext => ({
        parent: null,
        hasSetInitialContext: false,
        nodeViews: input.nodeViews,
        editorState: EditorState.create({
            // TODO: Make schema configurable
            doc: input.initialDocument,
            schema,
            plugins: [
                // Enable undo/redo
                history(),
                keymap({ 'Mod-z': undo, 'Mod-y': redo }),
                ...createAtMentionPlugin(),
                atMentionSuggestions(self),
                // Enables basic keybindings for handling cursor movement
                keymap(baseKeymap),
                // Adds a placholder text
                placeholder(input.placeholder ?? ''),
            ],
        }),
        suggestions: {
            filter: '',
            selectedIndex: 0,
            items: [],
            position: {top: 0, left: 0, bottom: 0, right: 0},
        },
    }),
    type: 'parallel',
    states: {
        editor: {
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
                                    enqueue({type: 'updateEditorState', params: context.editorState.tr.setSelection(Selection.atEnd(context.editorState.doc))})
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
                'dispatch': {
                    actions: {
                        type: 'updateEditorState',
                        params: ({event}) => event.transaction,
                    },
                },

                'text.append': {
                    actions: {type: 'updateEditorState', params: (({context, event}) => {
                        const tr = context.editorState.tr
                        tr.setSelection(Selection.atEnd(tr.doc))
                        return insertWhitespaceIfNeeded(tr).insertText(event.text)
                    })}
                },

                'mentions.filter': {
                    actions: {
                        type: 'updateEditorState',
                        params: ({context, event}) => filterMentions(context.editorState, event.filter),
                    }
                },
                'mentions.add': {
                    actions: {
                        type: 'updateEditorState',
                        params: ({context, event}) => addMentions(context.editorState, event.items, event.position, event.separator),
                    },
                },
                'mentions.setInitial': {
                    guard: 'canSetInitialMentions',
                    actions: [
                        assign({hasSetInitialContext: true}),
                        {
                            type: 'updateEditorState',
                            params: ({context, event}) => {
                                const tr = context.editorState.tr
                                if (isEditorContentOnlyInitialContext(context.editorState)) {
                                    tr.delete(0, tr.doc.content.size)
                                }
                                if (event.items.length > 0) {
                                    tr.insert(0, event.items.flatMap(item => [createMentionNode({item, isFromInitialContext: true}), schema.text(' ')]))
                                }
                                tr.setSelection(Selection.atEnd(tr.doc))
                                return tr
                            },
                        },
                    ],
                },
            },
        },

        suggestions: {
            initial: 'closed',
            states: {
                closed: {
                    on: {
                        'suggestions.open': {
                            target: 'open.loading',
                            actions: {
                                type: 'assignSuggestions',
                                params: ({event}) => ({
                                    filter: '',
                                    selectedIndex: 0,
                                    items: [],
                                    position: event.position,
                                }),
                            },
                        },
                    },
                },
                open: {
                    tags: 'show suggestions',
                    initial: 'idle',
                    states: {
                        idle: {
                            on: {
                                "suggestions.select.next": {
                                    actions: {
                                        type: 'assignSuggestions',
                                        params: ({context}) => ({
                                            selectedIndex: (context.suggestions.selectedIndex + 1) % context.suggestions.items.length,
                                        }),
                                    },
                                },
                                "suggestions.select.previous": {
                                    actions: {
                                        type: 'assignSuggestions',
                                        params: ({context}) => ({
                                            selectedIndex: context.suggestions.selectedIndex === 0 ? context.suggestions.items.length - 1 : context.suggestions.selectedIndex - 1,
                                        }),
                                    },
                                },
                                'suggestions.apply': {
                                    actions: [
                                        enqueueActions(({enqueue, event}) => {
                                            if(event.index !== undefined) {
                                                enqueue({type: 'assignSuggestions', params: {selectedIndex: event.index}})
                                            }
                                        }),
                                        'applySelection',
                                    ],
                                },
                            },
                        },
                        debounce: {
                            tags: 'fetch suggestions',
                            after: {
                                300: 'loading',
                            },
                            always: {
                                guard: {type: 'isFilterEmpty'},
                                target: 'loading',
                            },
                            on: {
                                "suggestions.filter.update": {
                                    actions: {
                                        type: 'assignSuggestions',
                                        params: ({event}) => ({
                                            filter: event.filter,
                                            position: event.position,
                                        }),
                                    },
                                    reenter: true,
                                },
                            },
                        },
                        loading: {
                            tags: 'fetch suggestions',
                            invoke: {
                                src: 'fetchMenuData',
                                input: ({ context }) => ({query: context.suggestions.filter}),
                                onDone: {
                                    actions: {
                                        type: 'assignSuggestions',
                                        params: ({event}) => ({
                                            items: event.output,
                                            selectedIndex: 0,
                                        }),
                                    },
                                    target: 'idle',
                                },
                                onError: {
                                    // TODO: Implement error handling
                                },
                            },
                        },
                    },
                    on: {
                        "suggestions.close": 'closed',
                        "suggestions.filter.update": {
                            guard: { type: 'hasFilterChanged', params: ({event}) => event},
                            actions: {
                                type: 'assignSuggestions',
                                params: ({event}) => ({
                                    filter: event.filter,
                                    position: event.position,
                                }),
                            },
                            target: '.debounce',
                        },
                    },
                },
            },
        },
    },
})

export function createMenuDataProvider(fetchMenuData: (args: {query: string}) => Promise<Item<ContextItem|ContextMentionProviderMetadata>[]>): PromiseActorLogic<Item<ContextItem|ContextMentionProviderMetadata>[], {query: string}> {
    return fromPromise(({input}) => fetchMenuData(input))
}

/**
 * A plugin that adds a placeholder to the editor
 */
function placeholder(text: string): Plugin {
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

/**
 * A plugin that connects at-mentions with showing and handling suggestions.
 */
function atMentionSuggestions(actor: ActorRefFrom<typeof promptInput>): Plugin {
    return new Plugin({
        view() {
            return {
                update(view: EditorView, prevState: EditorState) {
                    if (hasAtMention(view.state) && !hasAtMention(prevState)) {
                        actor.send({ type: 'suggestions.open', position: view.coordsAtPos(getAtMentionPosition(view.state)) })
                    } else if (!hasAtMention(view.state) && hasAtMention(prevState)) {
                        actor.send({type: 'suggestions.close'})
                    }

                    const mentionValue = getAtMentionValue(view.state)
                    if (mentionValue !== undefined && mentionValue !== getAtMentionValue(prevState)) {
                        actor.send({ type: 'suggestions.filter.update', filter: mentionValue.slice(1), position: view.coordsAtPos(getAtMentionPosition(view.state)) })
                    }
                }
            }
        },
        props: {
            handleKeyDown(view, event) {
                if (actor.getSnapshot().hasTag('show suggestions')) {
                    switch (event.key) {
                        case 'ArrowDown': {
                            actor.send({ type: 'suggestions.select.next' })
                            return true
                        }
                        case 'ArrowUp': {
                            actor.send({ type: 'suggestions.select.previous' })
                            return true
                        }
                        case 'Enter':
                            actor.send({ type: 'suggestions.apply' })
                            return true;
                        case 'Escape':
                            view.dispatch(disableAtMention(view.state.tr))
                            return true;
                    }
                }
                return false
            },
        },
    })
}

/**
 * Inserts a whitespace character at the given position if needed. If the position is not provided
 * the current selection of the transaction is used.
 * @param tr The transaction
 * @param pos The position to insert the whitespace
 * @returns The transaction
 */
function insertWhitespaceIfNeeded(tr: Transaction, pos?: number): Transaction {
    pos = pos ?? tr.selection.from
    if (!/(^|\s)$/.test(tr.doc.textBetween(0, pos))) {
        tr.insertText(' ', pos)
    }
    return tr
}

/**
 * Creates a transaction that filters out mentions that do not fulfill the filter function.
 * @param state The current editor state
 * @param filter The filter function
 * @returns A transaction that filters out mentions
 */
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

/**
 * Returns all mentions in the document.
 * @param doc The document
 * @returns An array of mentions
 */
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

/**
 * Creates a transaction that adds or updates mentions.
 * @param state The current editor state
 * @param items The items to add or update
 * @param position The position to add the mentions
 * @param separator The separator to use between new mentions
 * @returns A transaction that adds or updates mentions
 */
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
                            createMentionNode({item: newItem})
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
            mentionNodes.push(createMentionNode({item}))
            mentionNodes.push(separatorNode)
        }
        const paragraph = state.schema.nodes.paragraph.create({}, mentionNodes)

        if (position === 'before') {
            tr.insert(Selection.atStart(tr.doc).from, paragraph)
        } else {
            insertWhitespaceIfNeeded(tr, Selection.atEnd(tr.doc).from)
            tr.insert(Selection.atEnd(tr.doc).from, paragraph)
        }
    }

    return tr
}

/**
 * @param state The editor state
 * @returns Whether the editor content only consists of initial context items
 */
function isEditorContentOnlyInitialContext(state: EditorState): boolean {
    let onlyInitialContext = true
    state.doc.descendants(node => {
        if (!onlyInitialContext) {
            return false // no need to traverse anymore
        }

        switch (node.type.name) {
            case 'mention': {
                if (!node.attrs.isFromInitialContext) {
                    onlyInitialContext = false
                }
                return false // never traverse into mentions
            }
            case 'text': {
                if (node.text?.trim() !== '') {
                    onlyInitialContext = false
                }
                break
            }
            case 'paragraph':
            case 'doc':
                break
            default:
                onlyInitialContext = false
        }
        return onlyInitialContext
    })
    return onlyInitialContext
}

/**
 * Creates a mention node from a context item.
 */
export function createMentionNode(attrs: {item: SerializedContextItem, isFromInitialContext?: boolean}): Node {
    return schema.nodes.mention.create(attrs, schema.text(contextItemMentionNodeDisplayText(attrs.item)))
}
