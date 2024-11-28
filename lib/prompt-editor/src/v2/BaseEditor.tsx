import { Decoration, DecorationSet, EditorView } from "prosemirror-view"
import { history, undo, redo } from "prosemirror-history"
import { EditorState, Plugin, TextSelection } from "prosemirror-state"
import { Node, Schema } from "prosemirror-model"
import { baseKeymap } from "prosemirror-commands"
import { InputRule, inputRules } from "prosemirror-inputrules"
import { keymap } from "prosemirror-keymap"
import { MouseEventHandler, useCallback, useEffect, useRef } from "react"
import { ActorRefFrom, assign, setup, enqueueActions, fromPromise } from 'xstate'
import { useActorRef, useSelector } from '@xstate/react'
import styles from './BaseEditor.module.css'
import { useDefaultContextForChat } from "../useInitialContext"
import { ContextItem, ContextMentionProviderMetadata, displayPathBasename, FILE_CONTEXT_MENTION_PROVIDER, REMOTE_REPOSITORY_PROVIDER_URI, SYMBOL_CONTEXT_MENTION_PROVIDER } from "@sourcegraph/cody-shared"
import clsx from "clsx"
import { iconForProvider } from "../mentions/mentionMenu/MentionMenuItem"
import { AtSignIcon } from "lucide-react"
import { createRoot, Root } from 'react-dom/client'
import "prosemirror-view/style/prosemirror.css"

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

export interface Item<T> {
    data: T
    onSelected: (editor: EditorView, range: {from: number, to: number}, data: T) => true | { replace: Node, appendSpaceIfNecessary?: boolean }
    render: (item: T) => React.ReactNode
}

interface Position {
    top: number
    bottom: number
    left: number
    right: number
}

interface SuggestionsMachineContext {
    filter?: string,
    selectedIndex: number,
    filteredItems: Item<unknown>[]
    position: Position
    fetchMenuData: (args: {query: string}) => Promise<Item<unknown>[]>
}

/**
 * This state machine is responsible for managing the suggestions menu. It
 * takes care of triggering data loading, suggestion selection, etc
 */
const suggestionsMachine = setup({
    types: {
        events: {} as
            | { type: 'open', position: Position }
            | { type: 'close' }
            | { type: 'arrow-down' }
            | { type: 'arrow-up' }
            | { type: 'enter' }
            | { type: 'select', index: number }
            | { type: 'filter.update', filter: string, position: Position }
        ,
        context: {} as SuggestionsMachineContext,
        input: {} as Pick<SuggestionsMachineContext, 'fetchMenuData'>,
        emitted: {} as
            | { type: 'select', item: Item<unknown> }
        ,
    },
    actors: {
        menuDataLoader: fromPromise<Item<unknown>[], SuggestionsMachineContext>(({ input }) => {
            return input.fetchMenuData({
                query: input.filter ?? '',
            })
        })
    },
    actions: {
        select: enqueueActions(({context, enqueue}) => {
            const selectedItem = context.filteredItems[context.selectedIndex]
            if (selectedItem) {
                enqueue.emit({ type: 'select', item: selectedItem })
            }
        }),
    },
}).createMachine({
    initial: 'closed',
    context: ({ input }) => {
        return {
            selectedIndex: 0,
            filteredItems: [],
            position: { top: 0, left: 0, bottom: 0, right: 0 },
            ...input,
        }
    },
    states: {
        closed: {
            on: {
                open: {
                    actions: assign({ position: ({event}) => event.position }),
                    target: 'open',
                },
            },
        },
        open: {
            initial: 'idle',
            entry: [
                assign({
                    filter: undefined,
                    selectedIndex: 0,
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
                    actions: assign({
                        filter: ({event}) => event.filter,
                        position: ({event}) => event.position,
                    }),
                    target: '.debounce',
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

type SuggestionsPluginState =
  | { type: 'closed', decoration: DecorationSet }
  | { type: 'open', start: number, decoration: DecorationSet }

type SuggestionsPluginEvent =
  | { type: 'open', position: number }
  | { type: 'close' }

interface SuggestionsPluginConfig {
    actor: ActorRefFrom<typeof suggestionsMachine>
}

const emptyState: SuggestionsPluginState = {
    type: 'closed',
    decoration: DecorationSet.empty,
}

function createSuggestionsPlugin({actor }: SuggestionsPluginConfig): Plugin[] {
    const plugin = new Plugin<SuggestionsPluginState>({
        state: {
            init(config, instance) {
                return emptyState
            },
            apply(tr, value, oldState, newState) {
                const event = tr.getMeta(plugin) as SuggestionsPluginEvent | undefined

                // Handle internal/explicit events first
                switch (event?.type) {
                    case 'open': {
                        switch (value.type) {
                            case 'closed': {
                                return {
                                    type: 'open',
                                    start: event.position,
                                    decoration: DecorationSet.create(newState.doc, [
                                        Decoration.inline(
                                            event.position,
                                            event.position + 1,
                                            { class: styles.active },
                                            // This is necessary so that mapping changes will 'grow' the decoration, which
                                            // also acts as markers for the filter text
                                            { inclusiveEnd: true }
                                        )
                                    ]),
                                }
                            }
                            default: {
                                return value
                            }
                        }
                    }
                    case 'close': {
                        return emptyState
                    }
                }

                // Handle other changes, e.g. selection or input changes. In particular we have to
                // update the decoration that tracks the current filter text
                let nextValue = value

                if (nextValue.type === 'open') {
                    // Expand decoration to cover the filter text, if necessary
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

                    // Check whether selection moved outside of decoration
                    const pos = tr.selection.$from.pos
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
                if (state?.type === 'open') {
                    const decoration = state.decoration.find()[0]
                    switch (event.type) {
                        case 'select': {
                            const item = event.item
                            // todo: handle item.onSelected
                            const result = item.onSelected(view, decoration, item.data)
                            if (result === true) {
                                // handled by item.onSelected
                                return
                            }
                            const newNode = result.replace // schema.node('mention', { item }, schema.text(getItemTitle(item)))
                            const tr = view.state.tr.replaceWith(decoration.from, decoration.to, newNode)
                            const end = decoration.from + newNode.nodeSize

                            // Append a space after the node if necessary
                            if (result.appendSpaceIfNecessary && !/\s/.test(tr.doc.textBetween(end, end + 1))) {
                                tr.insertText(' ', end)
                            }
                            view.dispatch(tr
                                // Move selection after the space after the node
                                // (automatically closes menu)
                                .setSelection(TextSelection.create(tr.doc, end+1))
                                .scrollIntoView()
                            )
                            break;
                        }
                    }
                }
            })
            return {
                update(view, prevState) {
                    // Synchronize state with state machine
                    const next = plugin.getState(view.state)
                    const prev = plugin.getState(prevState)

                    if (next?.type === 'open' && next.type !== prev?.type) {
                        const decoration = next.decoration.find()[0]
                        actor.send({ type: 'open', position: view.coordsAtPos(decoration.from) })
                    } else if (next?.type === 'closed' && next.type !== prev?.type) {
                        actor.send({ type: 'close' })
                    }

                    if (next?.type === 'open' && next.decoration !== prev?.decoration) {
                        const decoration = next.decoration.find()[0]
                        if (decoration) {
                            actor.send({
                                type: 'filter.update',
                                // +1 to remove leading '@' character
                                filter: view.state.doc.textBetween(decoration.from + 1, decoration.to),
                                position: view.coordsAtPos(decoration.from)
                            })
                        }
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
                            view.dispatch(view.state.tr.setMeta(plugin, {type: 'close'} as SuggestionsPluginEvent))
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
                            .setMeta(plugin, {type: 'open',  position: start + (match[0][1] ? 1 : 0) } as SuggestionsPluginEvent)
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

type BaseEditorProps<T> = {
    className?: string
    placeholder?: string
    onEnterKey?: (event: Event) => void
    onChange?: (state: EditorState) => void
    fetchMenuData: (args: {query: string}) => Promise<Item<T>[]>
    onSuggestionsMenuClose?: () => void
} & Pick<SuggestionsProps, 'getEmptyLabel' | 'getHeader'>

export const BaseEditor = <T,>(props: BaseEditorProps<T>) => {
    // TODO: Track token count/budget available
    const mentionMenuDataRef = useRef<BaseEditorProps<T>['fetchMenuData']>(() => Promise.resolve([]))
    // TODO: Handle initial context


    const actor = useActorRef(suggestionsMachine, { input: {
        fetchMenuData(args) {
            return mentionMenuDataRef.current(args) as Promise<Item<unknown>[]>
        },
    } })
    const view = useRef<EditorView | null>(null)

    // Update data fetch function as necessary
    useEffect(() => {
        mentionMenuDataRef.current = props.fetchMenuData
    }, [props.fetchMenuData])

    const isSuggestionsMenuOpen = useSelector(actor, state => state.matches('open'))

    useEffect(() => {
        if (view.current && !isSuggestionsMenuOpen) {
            props.onSuggestionsMenuClose?.()
        }
    }, [view, isSuggestionsMenuOpen])

    const createView = useCallback((node: HTMLDivElement) => {
        if (node) {
            const editor = new EditorView(node, {
                state: EditorState.create({
                    doc: props.initialEditorState ? schema.nodeFromJSON(props.initialEditorState) : undefined,
                    schema,
                    plugins: [
                        history(),
                        keymap({ 'Mod-z': undo, 'Mod-y': redo }),
                        // TODO: Align menu with right edge of input if necessary
                        // (maybe use floating-ui to also resize it to available space
                        ...createSuggestionsPlugin({actor}),
                        keymap(baseKeymap),
                        placeholder(props.placeholder ?? ''),
                    ],
                }),
                nodeViews: {
                    mention(node) {
                        return new MentionView(node)
                    },
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
        <div ref={createView} className={clsx(styles.editor, props.className)} />
        {isSuggestionsMenuOpen &&
            <Suggestions
                actor={actor}
                getEmptyLabel={props.getEmptyLabel}
                getHeader={props.getHeader}
            />
        }
        </>
}

interface SuggestionsProps {
    actor: ActorRefFrom<typeof suggestionsMachine>
    getHeader: () => React.ReactNode
    getEmptyLabel: (args: {filter: string}) => React.ReactNode
}

const Suggestions: React.FC<SuggestionsProps> = props => {
    const defaultContext = useDefaultContextForChat()
    const container = useRef<HTMLDivElement | null>(null)
    const items = useSelector(props.actor, state => state.context.filteredItems)
    const selectedIndex = useSelector(props.actor, state => state.context.selectedIndex)
    const filter = useSelector(props.actor, state => state.context.filter) ?? ''
    const loading = useSelector(props.actor, state => state.matches({ open: 'loading' }))
    const menuPosition = useSelector(props.actor, state => state.context.position)

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

    const header = props.getHeader()

    return <div
        ref={container}
        className={clsx(styles.suggestions, menuClass, { [styles.loading]: loading })}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={{ top: menuPosition.bottom, left: menuPosition.left }}>
        <ul>
            {header &&
                <li className={headerClass} aria-disabled="true">{header}</li>
            }
        {items.map((item, index) =>
            <li key={index} role="option" className={itemClass} aria-selected={index === selectedIndex}>
                {item.render(item.data)}
            </li>
        )}
            {loading && items.length === 0 && <li aria-disabled="true">Loading...</li>}
            {!loading && items.length === 0 && <li aria-disabled="true">{props.getEmptyLabel({filter})}</li>}
        </ul>
    </div>
}

const headerClass = '!tw-p-0 !tw-border-b-0 [&_[cmdk-group-heading]]:!tw-p-3 [&_[cmdk-group-heading]]:!tw-text-md [&_[cmdk-group-heading]]:!tw-leading-[1.2] [&_[cmdk-group-heading]]:!tw-h-[30px]'

const menuClass = ('tw-overflow-hidden tw-rounded-md tw-bg-popover tw-text-popover-foreground')

const itemClass = (
    'tw-relative tw-flex tw-cursor-pointer tw-select-none tw-items-center tw-py-3 tw-px-2 tw-text-md tw-outline-none aria-selected:tw-bg-accent aria-selected:tw-text-accent-foreground hover:tw-bg-accent hover:tw-text-accent-foreground data-[disabled=true]:tw-pointer-events-none data-[disabled=true]:tw-opacity-50 !tw-p-3 !tw-text-md !tw-leading-[1.2] !tw-h-[30px] !tw-rounded-none'
)

function getItemTitle(item: ContextItem|ContextMentionProviderMetadata): string {
    if ('id' in item) {
        return item.title
    }
    switch (item.type) {
        case 'symbol':
            return item.title ?? item.symbolName
        default:
            return item.title ?? displayPathBasename(item.uri)

    }
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
