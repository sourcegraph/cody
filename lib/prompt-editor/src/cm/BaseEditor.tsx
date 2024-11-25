import { Decoration, DecorationSet, EditorView } from "prosemirror-view"
import { history, undo, redo } from "prosemirror-history"
import { EditorState, Plugin, TextSelection } from "prosemirror-state"
import { Node, Schema } from "prosemirror-model"
import { baseKeymap } from "prosemirror-commands"
import { InputRule, inputRules, textblockTypeInputRule } from "prosemirror-inputrules"
import { keymap } from "prosemirror-keymap"
import { MouseEventHandler, useCallback, useContext, useEffect, useRef, useState } from "react"
import { ActorRefFrom, assign, setup, enqueueActions, fromPromise } from 'xstate'
import { useActorRef, useSelector } from '@xstate/react'
import styles from './BaseEditor.module.css'
import { useDefaultContextForChat } from "../useInitialContext"
import { ContextItem, ContextMentionProviderMetadata, displayPathBasename, FILE_CONTEXT_MENTION_PROVIDER, MentionMenuData, MentionQuery, NO_SYMBOL_MATCHES_HELP_LABEL, REMOTE_REPOSITORY_PROVIDER_URI, SYMBOL_CONTEXT_MENTION_PROVIDER } from "@sourcegraph/cody-shared"
import { useExtensionAPI } from "../useExtensionAPI"
import clsx from "clsx"
import { iconForProvider } from "../mentions/mentionMenu/MentionMenuItem"
import { AtSignIcon } from "lucide-react"
import { createRoot, Root } from 'react-dom/client'
import { ChatMentionContext } from "../plugins/atMentions/useChatContextItems"
import { CodeBlockView} from './CodeMirrorView'
import "prosemirror-view/style/prosemirror.css"

const schema = new Schema({
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
        code_block: {
            content: 'text*',
            marks: "",
            group: 'block',
            defining: true,
            parseDOM: [{tag: 'code_block', preserveWhitespace: true}],
            toDOM() {
                return ['pre', ['code', 0]]
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
                return ['span', { 'data-context-item': JSON.stringify(node.attrs.item), class: styles.mention }, 0]
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

interface SuggestionsMachineContext {
    filter?: string,
    selectedIndex: number,
    selectedProvider?: ContextMentionProviderMetadata
    filteredItems: Item[]
    fetchMenuData: (args: {query: string, providerID: string|null}) => Promise<Item[]>
}

type Item = ContextItem | { type: 'provider', provider: ContextMentionProviderMetadata }

/**
 * This state machine is responsible for managing the suggestions menu. It
 * takes care of triggering data loading, suggestion selection, etc
 */
const suggestionsMachine = setup({
    types: {
        events: {} as
            | { type: 'open' }
            | { type: 'close' }
            | { type: 'arrow-down' }
            | { type: 'arrow-up' }
            | { type: 'enter' }
            | { type: 'select', index: number }
            | { type: 'filter.update', filter: string }
            | { type: 'provider.set', provider: ContextMentionProviderMetadata, filter: string }
        ,
        context: {} as SuggestionsMachineContext,
        input: {} as Pick<SuggestionsMachineContext, 'fetchMenuData'>,
        emitted: {} as
            | { type: 'select' }
        ,
    },
    actors: {
        menuDataLoader: fromPromise<Item[], SuggestionsMachineContext>(({ input }) => {
            return input.fetchMenuData({
                query: input.filter ?? '',
                providerID: input.selectedProvider?.id ?? null,
            })
        })
    },
    actions: {
        select: enqueueActions(({context, enqueue}) => {
            const selectedItem = context.filteredItems[context.selectedIndex]
            if (selectedItem) {
                enqueue.emit({ type: 'select' })
            }
        }),
    },
}).createMachine({
    initial: 'closed',
    context: ({ input }) => {
        return {
            selectedIndex: 0,
            filteredItems: [],
            ...input,
        }
    },
    states: {
        closed: {
            on: {
                open: 'open',
            },
        },
        open: {
            initial: 'idle',
            entry: [
                assign({
                    filter: undefined,
                    selectedIndex: 0,
                    selectedProvider: undefined,
                    filteredItems: [],
                })
            ],
            states: {
                idle: {},
                debounce: {
                    after: {
                        300: 'loading',
                    },
                    always: {
                        guard: ({ context }) => !context.filter || context.filter.length === 0,
                        target: 'loading',
                    },
                },
                loading: {
                    invoke: {
                        src: 'menuDataLoader',
                        input: ({ context }) => context,
                        onDone: {
                            actions: [
                                assign(({ event }) => {
                                    return {
                                        filteredItems: event.output,
                                        selectedIndex: 0,
                                    }
                                })
                            ],
                            target: 'idle',
                        },
                    },
                },
            },
            on: {
                close: 'closed',
                "filter.update": {
                    guard: ({event, context}) => event.filter !== context.filter,
                    actions: assign({filter: ({event}) => event.filter}),
                    target: '.debounce',
                },
                'provider.set': {
                    actions: assign({
                        selectedProvider: ({event}) => event.provider,
                        filter: ({event}) => event.filter,
                        filteredItems: [],
                        selectedIndex: 0,
                    }),
                    target: ".loading",
                },
                "arrow-down": {
                    actions: assign({ selectedIndex: ({ context }) => (context.selectedIndex + 1) % context.filteredItems.length })
                },
                "arrow-up": {
                    actions: assign({ selectedIndex: ({ context }) => context.selectedIndex === 0 ? context.filteredItems.length - 1 : context.selectedIndex - 1 })
                },
                'enter': {
                    actions: 'select',
                },
                'select': {
                    actions: [
                        assign({ selectedIndex: ({ event }) => event.index }),
                        'select',
                    ],
                },
            }
        },
    },
})

interface SuggestionsPluginState {
    open: boolean
    start: number
    decoration: DecorationSet
}

interface SuggestionsPluginConfig {
    actor: ActorRefFrom<typeof suggestionsMachine>
    updatePosition: (position: {top: number, bottom: number, left: number, right: number}) => void,
}

const emptyState: SuggestionsPluginState = {
    open: false,
    start: 0,
    decoration: DecorationSet.empty
}

function createSuggestionsPlugin({actor, updatePosition }: SuggestionsPluginConfig): Plugin[] {
    const plugin = new Plugin<SuggestionsPluginState>({
        state: {
            init(config, instance) {
                return emptyState
            },
            apply(tr, value, oldState, newState) {
                let nextValue = value
                const meta = tr.getMeta(plugin)
                if (meta?.type === 'open') {
                    return {
                        open: true,
                        start: meta.position,
                        decoration: DecorationSet.create(newState.doc, [
                            Decoration.inline(
                                meta.position,
                                meta.position + 1,
                                { class: styles.active },
                                // This is necessary so that mapping changes will 'grow' the decoration, which
                                // also acts as markers for the filter text
                                { inclusiveEnd: true }
                            )
                        ]),
                    }
                } else if (meta?.type === 'close') {
                    return emptyState
                }

                if (nextValue.open && nextValue.decoration) {
                    const decorationSet = nextValue.decoration.map(tr.mapping, tr.doc)
                    if (decorationSet !== nextValue.decoration) {
                        const decoration = decorationSet.find()[0]
                        // Check whether the change has removed the decoration or introduced a space.
                        // If yes to either we close the menu
                        if (!decoration || /[\s\0]/.test(tr.doc.textBetween(decoration.from, decoration.to))) {
                            return emptyState
                        }
                        nextValue = {
                            ...nextValue,
                            decoration: decorationSet,
                        }
                    }
                    const pos = tr.selection.$from.pos
                    // Check whether selection moved outside of decoration
                    if (nextValue.decoration.find(pos, pos).length === 0) {
                        return emptyState
                    }
                }
                return nextValue
            },
        },
        view(view) {
            const sub = actor.on('*', event => {
                const state = plugin.getState(view.state)
                const decoration = state?.decoration.find()[0]
                if (decoration) {
                    switch (event.type) {
                        case 'select': {
                            const snapshot = actor.getSnapshot()
                            const item = snapshot.context.filteredItems[snapshot.context.selectedIndex]
                            if (item.type ===  'provider') {
                                actor.send({type: 'provider.set', provider: item.provider, filter: ''})
                                view.dispatch(
                                    view.state.tr.delete(decoration.from + 1, decoration.to)
                                )
                            } else {
                                const newNode = schema.node('mention', { item }, schema.text(getItemTitle(item)))
                                const tr = view.state.tr.replaceWith(decoration.from, decoration.to, newNode)
                                const end = decoration.from + newNode.nodeSize

                                // Append a space after the node if necessary
                                if (!/\s/.test(tr.doc.textBetween(end, end + 1))) {
                                    tr.insertText(' ', end)
                                }
                                view.dispatch(tr
                                    // Move selection after the space after the node
                                    // (automatically closes menu)
                                    .setSelection(TextSelection.create(tr.doc, end+1))
                                    .scrollIntoView()
                                )
                            }
                            break;
                        }
                    }
                }
            })
            return {
                update(view, prevState) {
                    const next = plugin.getState(view.state)
                    const prev = plugin.getState(prevState)
                    if (next?.open && !prev?.open) {
                        actor.send({ type: 'open' })
                    } else if (next && !next.open) {
                        actor.send({ type: 'close' })
                    }
                    if (next?.open && next.decoration && next.decoration !== prev?.decoration) {
                        const decoration = next.decoration.find()[0]
                        if (decoration) {
                            actor.send({
                                type: 'filter.update',
                                // +1 to remove leading '@' character
                                filter: view.state.doc.textBetween(decoration.from + 1, decoration.to)
                            })
                        }
                        updatePosition(view.coordsAtPos(decoration.from))
                    }
                },
                destroy() {
                    sub.unsubscribe()
                },
            }
        },
        props: {
            handleKeyDown(view, event) {
                if (actor.getSnapshot().matches('open')) {
                    switch (event.key) {
                        case 'ArrowDown': {
                            actor.send({ type: 'arrow-down' })
                            return true
                        }
                        case 'ArrowUp': {
                            actor.send({ type: 'arrow-up' })
                            return true
                        }
                        case 'Enter':
                            actor.send({ type: 'enter' })
                            return true;
                        case 'Escape':
                            view.dispatch(view.state.tr.setMeta(plugin, {type: 'close'}))
                            return true;
                    }
                }
                return false
            },
            decorations(state): DecorationSet | undefined {
                return plugin.getState(state)?.decoration
            },
        },
    })

    return [
        plugin,
        inputRules({
            rules: [
                new InputRule(
                    // Trigger on @, at beginning or after space
                    /(^|\s)@(?=\s|$)$/,
                    (state, match, start, end) => {
                        return state.tr
                            .insertText(match[0], start, end)
                            .setMeta(plugin, {type: 'open',  position: start + (match[0][1] ? 1 : 0) })
                    },
                )

            ]
        })
    ]
}

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

interface BaseEditorProps {
    placeholder?: string
    onEnterKey?: (event: Event) => void
    onChange?: (state: EditorState) => void
}

export const BaseEditor: React.FC = (props: BaseEditorProps) => {
    // TODO: Track token count/budget available
    // TODO: Handle initial context
    const mentionMenuDataRef = useRef<SuggestionsMachineContext['fetchMenuData']>(() => Promise.resolve([]))
    const [menuPosition, setMenuPosition] = useState({ left: 0, bottom: 0 })
    // TODO: Move this out of component
    const mentionMenuData = useExtensionAPI().mentionMenuData
    // TODO: Move this out of component
    const mentionSettings = useContext(ChatMentionContext)


    const actor = useActorRef(suggestionsMachine, { input: {
        fetchMenuData(args) {
            return mentionMenuDataRef.current(args)
        },
    } })
    const view = useRef<EditorView | null>(null)

    // Update data fetch function as necessary
    useEffect(() => {
        mentionMenuDataRef.current = ({query, providerID: provider}) => new Promise((resolve, reject) => {
            let result: MentionMenuData
            return mentionMenuData({text: query, provider}).subscribe(
                next => {
                    result = next
                },
                error => reject(error),
                () => {
                    resolve([
                        ...result.providers.map(provider => ({type: 'provider' as const, provider})),
                        ...result.items ?? [],
                    ])
                }
            )
        })
    }, [mentionMenuData, mentionSettings])

    const isSuggestionsMenuOpen = useSelector(actor, state => state.matches('open'))

    const createView = useCallback((node: HTMLDivElement) => {
        if (node) {
            const editor = new EditorView(node, {
                state: EditorState.create({
                    schema,
                    plugins: [
                        history(),
                        keymap({ 'Mod-z': undo, 'Mod-y': redo }),
                        // TODO: Align menu with right edge of input if necessary
                        // (maybe use floating-ui to also resize it to available space
                        ...createSuggestionsPlugin({actor, updatePosition: setMenuPosition}),
                        keymap(baseKeymap),
                        placeholder(props.placeholder ?? ''),
                        inputRules({
                            rules: [textblockTypeInputRule(/^```$/, schema.nodes.code_block)],
                        })
                    ],
                }),
                nodeViews: {
                    mention(node) {
                        return new MentionView(node)
                    },
                    code_block(node, view, getPos) {
                        return new CodeBlockView(node, view, getPos)
                    }
                },
                dispatchTransaction(tr) {
                    const newstate = editor.state.apply(tr)
                    props.onChange?.(newstate)
                    editor.updateState(newstate)
                },
            })
            view.current = editor
        } else {
            view.current?.destroy()
        }
    }, [props.placeholder, props.onEnterKey, actor])

    return <>
        <div ref={createView} className={styles.editor} />
        {isSuggestionsMenuOpen &&
            <Suggestions
                actor={actor}
                style={{ top: menuPosition.bottom, left: menuPosition.left }}
            />
        }
        </>
}

const Suggestions: React.FC<{ actor: ActorRefFrom<typeof suggestionsMachine>, style: Record<string, number> }> = props => {
    const defaultContext = useDefaultContextForChat()
    const container = useRef<HTMLDivElement | null>(null)
    const items = useSelector(props.actor, state => state.context.filteredItems)
    const selectedIndex = useSelector(props.actor, state => state.context.selectedIndex)
    const selectedProvider = useSelector(props.actor, state => state.context.selectedProvider ?? null)
    const filter = useSelector(props.actor, state => state.context.filter)
    const loading = useSelector(props.actor, state => state.matches({ open: 'loading' }))

    useEffect(() => {
        container.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    }, [container, selectedIndex])

    useEffect(() => {
        defaultContext.initialContext
    }, [defaultContext])

    // Prevent input loosing focus
    const handleMouseDown: MouseEventHandler = useCallback(event => {
            event.preventDefault()
    }, [])

    const handleClick: MouseEventHandler = useCallback(event => {
        const listNode = event.target?.closest('li') as HTMLLIElement | null
        if (listNode?.parentNode) {
            const options = listNode.parentNode.querySelectorAll('[role="option"]')
            props.actor.send({ type: 'select', index: [].indexOf.call(options, listNode) })
        }
    }, [])

    return <div
        ref={container}
        className={clsx(styles.suggestions, menuClass, { [styles.loading]: loading })}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={props.style}>
        <ul>
            {selectedProvider &&
                <li className={headerClass} aria-disabled="true">{selectedProvider.title}</li>
            }
        {items.map((item, index) =>
            <li role="option" className={itemClass} aria-selected={index === selectedIndex}>
                {getItemTitle(item)}
                </li>
        )}
            {loading && items.length === 0 && <li aria-disabled="true">Loading...</li>}
            {!loading && items.length === 0 && <li aria-disabled="true">{getEmptyLabel(selectedProvider, { text: filter ?? '', provider: selectedProvider?.id ?? null })}</li>}
        </ul>
    </div>
}

const headerClass = '!tw-p-0 !tw-border-b-0 [&_[cmdk-group-heading]]:!tw-p-3 [&_[cmdk-group-heading]]:!tw-text-md [&_[cmdk-group-heading]]:!tw-leading-[1.2] [&_[cmdk-group-heading]]:!tw-h-[30px]'

const menuClass = ('tw-overflow-hidden tw-rounded-md tw-bg-popover tw-text-popover-foreground')

const itemClass = (
    'tw-relative tw-flex tw-cursor-pointer tw-select-none tw-items-center tw-py-3 tw-px-2 tw-text-md tw-outline-none aria-selected:tw-bg-accent aria-selected:tw-text-accent-foreground hover:tw-bg-accent hover:tw-text-accent-foreground data-[disabled=true]:tw-pointer-events-none data-[disabled=true]:tw-opacity-50 !tw-p-3 !tw-text-md !tw-leading-[1.2] !tw-h-[30px] !tw-rounded-none'
)

function getItemTitle(item: Item): string {
    switch (item.type) {
        case 'provider':
            return item.provider.title
        case 'symbol':
            return item.title ?? item.symbolName
        default:
            return item.title ?? displayPathBasename(item.uri)

    }
}

function getEmptyLabel(
    parentItem: ContextMentionProviderMetadata | null,
    mentionQuery: MentionQuery
): string {
    if (!mentionQuery.text) {
        return parentItem?.queryLabel ?? 'Search...'
    }

    if (!parentItem) {
        return FILE_CONTEXT_MENTION_PROVIDER.emptyLabel!
    }
    if (parentItem.id === SYMBOL_CONTEXT_MENTION_PROVIDER.id && mentionQuery.text.length < 3) {
        return SYMBOL_CONTEXT_MENTION_PROVIDER.emptyLabel! + NO_SYMBOL_MATCHES_HELP_LABEL
    }

    return parentItem.emptyLabel ?? 'No results'
}

class MentionView {
    public dom: HTMLElement
    private root: Root

    constructor(node: Node) {
        const item = node.attrs.item as ContextItem
        this.dom = document.createElement('span')
        this.dom.className = styles.mention
        this.root = createRoot(this.dom)
        this.root.render(<MentionChip item={item} />)
    }

    stopEvents() {
        return true
    }

    selectNode() {
        this.dom.classList.add(styles.mentionFocused)
    }

    deselectNode() {
        this.dom.classList.remove(styles.mentionFocused)
    }

    destroy() {
        this.root.unmount()
    }
}

function iconForContextItem(item: ContextItem): React.ComponentType {
    let providerURI = 'unknown'
    switch (item.type) {
        case 'file':
            providerURI = FILE_CONTEXT_MENTION_PROVIDER.id
            break;
        case 'symbol':
            providerURI = SYMBOL_CONTEXT_MENTION_PROVIDER.id
            break;
        case 'repository':
        case 'tree':
            REMOTE_REPOSITORY_PROVIDER_URI
            break
        case 'openctx':
            providerURI = item.providerUri
            break
    }

    return iconForProvider[providerURI] ?? AtSignIcon
}

interface MentionChipProps {
    item: ContextItem
}

const MentionChip: React.FC<MentionChipProps> = props => {
    const Icon = iconForContextItem(props.item)
    return <>
        {Icon && <Icon />}
        <span>{getItemTitle(props.item)}</span>
    </>
}
