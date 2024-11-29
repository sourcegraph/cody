import { fromPromise, setup, enqueueActions, assign } from "xstate"
import { Position } from "./atMention"
import { EditorState, Transaction } from "prosemirror-state"

export interface Item<T> {
    data: T
    select(state: EditorState, dispatch: (tr: Transaction) => void, data: T): void
    // TODO: THis shouldn't be defined here
    render(data: T): JSX.Element|string
}

export interface SuggestionsMachineContext<T> {
    filter?: string,
    selectedIndex: number,
    filteredItems: Item<unknown>[]
    position: Position
    fetchMenuData: (args: {query: string}) => Promise<Item<T>[]>
}

export type SuggestionsMachine<T> = ReturnType<typeof createSuggestionsMachine<T>>

/**
 * This state machine is responsible for managing the suggestions menu. It
 * takes care of triggering data loading, suggestion selection, etc
 */
export function createSuggestionsMachine<T>() {
    return setup({
        types: {
            events: {} as
            | { type: 'suggestions.open', position: Position }
            | { type: 'suggestions.close' }
            | { type: 'suggestions.key.arrow-down' }
            | { type: 'suggestions.key.arrow-up' }
            | { type: 'suggestions.filter.update', filter: string, position: Position }
            ,
            context: {} as SuggestionsMachineContext<T>,
            input: {} as Pick<SuggestionsMachineContext<T>, 'fetchMenuData'>,
            emitted: {} as { type: 'select', item: Item<unknown> }
        },
        actors: {
            menuDataLoader: fromPromise<Item<unknown>[], SuggestionsMachineContext<T>>(({ input }) => {
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
        guards: {
            isFilterEmpty: ({ context }) => !context.filter || context.filter.length === 0,
            hasFilterChanged: ({ context }, params: { filter: string }) => {
                return context.filter !== params.filter
            }
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
                    'suggestions.open': {
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
                            guard: {type: 'isFilterEmpty'},
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
                    "suggestions.close": 'closed',
                    "suggestions.filter.update": {
                        guard: { type: 'hasFilterChanged', params: ({event}) => event},
                        actions: assign({
                            filter: ({event}) => event.filter,
                            position: ({event}) => event.position,
                        }),
                        target: '.debounce',
                    },
                    "suggestions.key.arrow-down": {
                        actions: assign({ selectedIndex: ({ context }) => (context.selectedIndex + 1) % context.filteredItems.length })
                    },
                    "suggestions.key.arrow-up": {
                        actions: assign({ selectedIndex: ({ context }) => context.selectedIndex === 0 ? context.filteredItems.length - 1 : context.selectedIndex - 1 })
                    },
                }
            },
        },
    })
}
