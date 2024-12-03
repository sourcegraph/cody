import { useActorRef, useSelector } from "@xstate/react"
import { DataLoaderInput, promptInput } from "./promptInput"
import { ContextItem, ContextMentionProviderMetadata, serializeContextItem, SerializedContextItem } from "@sourcegraph/cody-shared"
import { Item } from "./Suggestions"
import { ActorRefFrom, fromCallback } from "xstate"
import { useEffect, useMemo } from "react"
import { Node } from "prosemirror-model"
import { MentionView } from "./mentionNode"
import { replaceDocument } from "./prosemirror-utils"
import { EditorState } from "prosemirror-state"
import { Position } from "./atMention"
import type {AnyEventObject, EventFrom } from 'xstate'
import type { Observable } from "observable-fns"

type MenuItem = Item<ContextItem|ContextMentionProviderMetadata>
type PromptInputLogic = typeof promptInput
type PromptInputActor = ActorRefFrom<PromptInputLogic>

interface PromptEditorOptions {
    placeholder?: string
    initialDocument?: Node
    onChange?: (doc: Node) => void
    fetchMenuData: (args: {query: string, parent?: ContextMentionProviderMetadata}) => Observable<MenuItem[]>
}

interface PromptEditorAPI {
    applySuggestion(index?: number): void
    setFocus(focus: boolean, options?: { moveCursorToEnd?: boolean }): void
    appendText(text: string): void
    addMentions(items: ContextItem[], position?: 'before' | 'after', sep?: string): void
    filterMentions(filter: (item: SerializedContextItem) => boolean): void
    setInitialContextMentions(items: ContextItem[]): void
    setDocument(doc: Node): void
    getEditorState(): EditorState
    ref(node: HTMLDivElement|null): void
}

function getCurrentEditorState(input: ActorRefFrom<typeof promptInput>): EditorState {
    return input.getSnapshot().context.editorState
}

export const useEditor = (options: PromptEditorOptions): [PromptInputActor, PromptEditorAPI] => {
    const fetchMenuData = useMemo(() => fromCallback<AnyEventObject, DataLoaderInput>(({input}) => {
        console.log('fetchMenuData', input.query, input.context)
        const subscription = options.fetchMenuData({query: input.query, parent: input.context}).subscribe(
            next => {
                input.parent.send({type: 'suggestions.results.set', data: next})
            },
        )
        return () => subscription.unsubscribe()
    }), [options.fetchMenuData])

    const editor = useActorRef(promptInput.provide({
        actors: {
            fetchMenuData,
        },
    }), { input: {
        placeholder: options.placeholder,
        initialDocument: options.initialDocument,
        nodeViews: {
            mention(node) {
                return new MentionView(node)
            },
        },
    }})

    const api: PromptEditorAPI  = useMemo(() => ({
        setFocus(focus, options) {
            if (focus) {
                editor.send({type: 'focus', moveCursorToEnd: options?.moveCursorToEnd})
            } else {
                editor.send({type: 'blur'})
            }
        },
        setDocument(doc: Node) {
            editor.send({type: 'dispatch', transaction: replaceDocument(getCurrentEditorState(editor), doc)})
        },
        setInitialContextMentions(items) {
            editor.send({type: 'mentions.setInitial', items: items.map(serializeContextItem)})
        },
        appendText(text) {
            editor.send({type: 'text.append', text})
        },
        addMentions(
            items: ContextItem[],
            position: 'before' | 'after' = 'after',
            sep = ' '
        ) {
            editor.send({type: 'mentions.add', items: items.map(serializeContextItem), position, separator: sep})
        },
        filterMentions(filter: (item: SerializedContextItem) => boolean) {
            editor.send({type: 'mentions.filter', filter})
        },
        applySuggestion(index) {
            editor.send({type: 'suggestions.apply', index})
        },
        getEditorState() {
            return getCurrentEditorState(editor)
        },
        ref(node: HTMLDivElement|null) {
            editor.send(
                node ? {type: 'setup', parent: node} : {type: 'teardown'}
            )
        }
    }), [editor])

    useEffect(() => {
        let previousDoc: Node|undefined
        const subscription = editor.subscribe(state => {
            if (state.context.editorState.doc !== previousDoc) {
                previousDoc = state.context.editorState.doc
                options.onChange?.(previousDoc)
            }
        })
        return () => subscription.unsubscribe()
    }, [editor, options.onChange])

    return [editor, api] as const
}

interface Suggestions {
    show: boolean
    items: MenuItem[]
    selectedIndex: number
    query: string
    isLoading: boolean
    position: Position
    parent: ContextMentionProviderMetadata | null
}

export function useSuggestions(input: PromptInputActor): Suggestions {
    const showSuggestions = useSelector(input, state => state.hasTag('show suggestions'))
    const suggestions = useSelector(input, state => state.context.suggestions)
    const isLoading = useSelector(input, state => state.hasTag('loading suggestions'))

    return {
        parent: suggestions.parent ?? null,
        show: showSuggestions,
        items: suggestions.items,
        selectedIndex: suggestions.selectedIndex,
        query: suggestions.filter,
        isLoading,
        position: suggestions.position,
    }
}
