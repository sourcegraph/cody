/**
 * This module contains the logic for the prompt editor. This includes states and event handling but not the UI
 * except for what prosemirror provides.
 */

import { setup, assign, fromCallback, ActorRefFrom, enqueueActions, sendTo, AnyEventObject, ActorLike, stopChild, spawnChild} from 'xstate'
import { Node, Schema } from 'prosemirror-model'
import { ContextItem, contextItemMentionNodeDisplayText, ContextMentionProviderMetadata, getMentionOperations, REMOTE_DIRECTORY_PROVIDER_URI, REMOTE_FILE_PROVIDER_URI, serializeContextItem, type SerializedContextItem } from '@sourcegraph/cody-shared'
import { EditorView, NodeViewConstructor } from 'prosemirror-view'
import { EditorState, Plugin, Selection, Transaction } from 'prosemirror-state'
import { history, undo, redo } from "prosemirror-history"
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { createAtMentionPlugin, disableAtMention, getAtMentionPosition, getAtMentionValue, hasAtMention, Position, replaceAtMention, setMentionValue } from './atMention'
import type { Item } from './Suggestions'

type MenuItem = Item<ContextItem|ContextMentionProviderMetadata>

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
const prosemirrorActor = fromCallback<ProseMirrorMachineEvent, ProseMirrorMachineInput>(({receive, input}) => {
    const editor = new EditorView(input.container ? {mount: input.container} : null, {
        state: input.initialState,
        nodeViews: input.nodeViews,
        dispatchTransaction(transaction) {
            input.parent.send({type: 'dispatch', transaction})
        },

    })

    const subscription = input.parent.subscribe(state => {
        if (state.context.editorState !== editor.state) {
            console.log(state.context.editorState.toJSON())
            editor.updateState(state.context.editorState)
        }
    })

    function doFocus() {
        editor.focus()
        editor.dispatch(editor.state.tr.scrollIntoView())

    }

    receive((event) => {
        switch (event.type) {
            case 'focus':
                doFocus()
                // HACK(sqs): Needed in VS Code webviews to actually get it to focus
                // on initial load, for some reason.
                setTimeout(doFocus)
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

export interface DataLoaderInput {
    query: string
    context?: ContextMentionProviderMetadata
    parent: ActorLike<any, {type: 'suggestions.results.set', data: MenuItem[]}>
}

const dataLoaderMachine = fromCallback<AnyEventObject, DataLoaderInput>(({input}) => {

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
    | { type: 'suggestions.results.set', data: MenuItem[] }
    | { type: 'suggestions.provider.set', provider: ContextMentionProviderMetadata }

interface PromptInputContext {
    parent: HTMLElement|null,
    editorState: EditorState
    nodeViews?: Record<string, NodeViewConstructor>
    hasSetInitialContext: boolean
    suggestions: {
        parent?: ContextMentionProviderMetadata,
        filter: string,
        selectedIndex: number,
        items: MenuItem[],
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
        fetchMenuData: dataLoaderMachine,
    },
    actions: {
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
        fetchMenuData: spawnChild('fetchMenuData', {
            id: 'fetchMenuData',
            input: ({context, self}) => (console.log('child spawned'), {
                context: context.suggestions.parent,
                query: context.suggestions.filter,
                parent: self,
            }),
        }),
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
            selection: input.initialDocument ? Selection.atEnd(input.initialDocument) : undefined,
            schema,
            plugins: [
                // Enable undo/redo
                history(),
                keymap({ 'Mod-z': undo, 'Mod-y': redo }),
                ...createAtMentionPlugin(),
                // @ts-expect-error
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
                                    tr.delete(Selection.atStart(tr.doc).from, tr.doc.content.size)
                                }
                                if (event.items.length > 0) {
                                    tr.insert(Selection.atStart(tr.doc).from, event.items.flatMap(item => [createMentionNode({item, isFromInitialContext: true}), schema.text(' ')]))
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
                                    parent: undefined,
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
                            exit: stopChild('fetchMenuData'),
                            on: {
                                "suggestions.results.set": {
                                    actions: {type: 'assignSuggestions', params: ({event}) => ({items: event.data})},
                                },
                                "suggestions.provider.set": {
                                    actions: {type: 'assignSuggestions', params: ({event}) => ({parent: event.provider, selectedIndex: 0})},
                                    target: 'loading',
                                },
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
                                        // Update selected index if necessary
                                        enqueueActions(({enqueue, event}) => {
                                            if(event.index !== undefined) {
                                                enqueue({type: 'assignSuggestions', params: {selectedIndex: event.index}})
                                            }
                                        }),
                                        // Handle menu item selection
                                        // TODO: This should probably be handled differently since it is very item specific
                                        enqueueActions(({context, enqueue}) => {
                                            const item = context.suggestions.items[context.suggestions.selectedIndex]?.data
                                            // I wish this wouldn't have to be inlined but typing enqueueActions is a pain
                                            if (!item) {
                                                return
                                            }
                                            console.log(item)

                                            // ContextMentionProviderMetadata
                                            if ('id' in item) {
                                                // Remove current mentions value
                                                enqueue({type: 'updateEditorState', params: setMentionValue(context.editorState, '')})
                                                // This is an event so that we can retrigger data fetching
                                                enqueue.raise({type: 'suggestions.provider.set', provider: item})
                                                return
                                            }

                                            // ContextItem
                                            // HACK: The OpenCtx interface do not support building multi-step selection for mentions.
                                            // For the remote file search provider, we first need the user to search for the repo from the list and then
                                            // put in the query to search for files. Below we are doing a hack to not set the repo item as a mention
                                            // but instead keep the same provider selected and put the full repo name in the query. The provider will then
                                            // return files instead of repos if the repo name is in the query.
                                            if (item.provider === 'openctx' && 'providerUri' in item) {
                                                if (
                                                    (item.providerUri === REMOTE_FILE_PROVIDER_URI && item.mention?.data?.repoName && !item.mention.data.filePath) ||
                                                    (item.providerUri === REMOTE_DIRECTORY_PROVIDER_URI) && item.mention?.data?.repoName && !item.mention.data.directoryPath) {
                                                    // Do not set the selected item as mention if it is repo item from the remote file search provider.
                                                    // Rather keep the provider in place and update the query with repo name so that the provider can
                                                    // start showing the files instead.
                                                    enqueue({type: 'updateEditorState', params: setMentionValue(context.editorState, item.mention.data.repoName + ':')})
                                                    enqueue({type: 'assignSuggestions', params: {selectedIndex: 0}})
                                                    return
                                                }
                                            }

                                            // When selecting a large file without range, add the selected option as text node with : at the end.
                                            // This allows users to autocomplete the file path, and provide them with the options to add range.
                                            if (item.isTooLarge && !item.range) {
                                                enqueue({type: 'updateEditorState', params: setMentionValue(context.editorState, contextItemMentionNodeDisplayText(serializeContextItem(item)) + ':')})
                                                return
                                            }

                                            // Insert mention node
                                            enqueue({
                                                type: 'updateEditorState',
                                                params: replaceAtMention(context.editorState, createMentionNode({item: serializeContextItem(item)}), true),
                                            })
                                        }),
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
                            entry: 'fetchMenuData',
                            // This isn't great but we don't know when data loading is done
                            always: 'idle',
                        },
                    },
                    on: {
                        "suggestions.close": 'closed',
                        "suggestions.filter.update": {
                            guard: { type: 'hasFilterChanged', params: ({event}) => event},
                            actions: [
                                stopChild('fetchMenuData'),
                                {
                                    type: 'assignSuggestions',
                                    params: ({event}) => ({
                                        filter: event.filter,
                                        position: event.position,
                                    }),
                                },
                            ],
                            target: '.debounce',
                        },
                    },
                },
            },
        },
    },
})

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

        if (position === 'before') {
            tr.insert(Selection.atStart(tr.doc).from, mentionNodes)
        } else {
            insertWhitespaceIfNeeded(tr, Selection.atEnd(tr.doc).from)
            tr.insert(Selection.atEnd(tr.doc).from, mentionNodes)
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
