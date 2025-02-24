/**
 * This module implements a variety of actions that can be applied to the prompt input.
 * They usually accept the current editor state as input and return a transaction to update
 * the editor state.
 * NOTE: If you add a new action here, add a corrsponding test in {@see promptInput.test.ts}.
 */

import {
    REMOTE_DIRECTORY_PROVIDER_URI,
    REMOTE_FILE_PROVIDER_URI,
    type SerializedContextItem,
    contextItemMentionNodeDisplayText,
    getMentionOperations,
    serializeContextItem,
} from '@sourcegraph/cody-shared'
import type { Node } from 'prosemirror-model'
import { type EditorState, Selection, type Transaction } from 'prosemirror-state'
import { type MenuItem, type MenuSelectionAPI, createMentionNode, schema } from './promptInput'

/**
 * Returns a {@link Transaction} to replace the current document with provided document.
 */
export function setDocument(state: EditorState, newDoc: Node): Transaction {
    return state.tr.replaceWith(0, state.doc.content.size, newDoc)
}

/**
 * Returns a transaction which appends the string `text` to the current document.
 */
export function appendToDocument(state: EditorState, text: string): Transaction {
    const tr = state.tr
    tr.setSelection(Selection.atEnd(tr.doc))
    return insertWhitespaceIfNeeded(tr).insertText(text)
}

/**
 * Returns a transaction that filters out mentions that do not fulfill the filter function.
 */
export function filterMentions(
    state: EditorState,
    filter: (item: SerializedContextItem) => boolean
): Transaction {
    const tr = state.tr
    state.doc.descendants((node, pos) => {
        if (node.type === schema.nodes.mention) {
            const item = node.attrs.item as SerializedContextItem
            if (!filter(item)) {
                tr.delete(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize))
            }
        }
    })
    return tr
}

/**
 * Returns a transaction that adds or updates mentions.
 * @param state The current editor state
 * @param items The items to add or update
 * @param position The position to add the mentions
 * @param separator The separator to use between new mentions
 */
export function addMentions(
    state: EditorState,
    items: SerializedContextItem[],
    position: 'before' | 'after',
    separator: string
): Transaction {
    const existingMentions = getMentions(state.doc)
    const operations = getMentionOperations(existingMentions, items)

    const tr = state.tr

    if (operations.modify.size + operations.delete.size > 0) {
        state.doc.descendants((node, pos) => {
            if (node.type === schema.nodes.mention) {
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
                            createMentionNode({ item: newItem })
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
            mentionNodes.push(createMentionNode({ item }))
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
 * Adds or updates mentions in the document. Unlike addMentions, this function does not remove any existing mentions.
 * @param state The current editor state
 * @param items The items to add or update
 * @param position The position to add the mentions
 * @param separator The separator to use between new mentions
 * @returns A transaction that adds or updates mentions
 */
export function upsertMentions(
    state: EditorState,
    items: SerializedContextItem[],
    position: 'before' | 'after',
    separator: string
): Transaction {
    const existingMentions = new Set(getMentions(state.doc).map(getKeyForContextItem))
    const toUpdate = new Map<string, SerializedContextItem>()
    for (const item of items) {
        const key = getKeyForContextItem(item)
        if (existingMentions.has(key)) {
            toUpdate.set(key, item)
        }
    }
    const tr = state.tr

    if (toUpdate.size > 0) {
        state.doc.descendants((node, pos) => {
            if (node.type === schema.nodes.mention) {
                const item = node.attrs.item as SerializedContextItem
                const key = getKeyForContextItem(item)
                if (toUpdate.has(key)) {
                    const newItem = toUpdate.get(key)
                    if (newItem) {
                        tr.replaceWith(
                            tr.mapping.map(pos),
                            tr.mapping.map(pos + node.nodeSize),
                            createMentionNode({ item: newItem })
                        )
                    }
                }
            }
        })
    }

    return toUpdate.size !== items.length
        ? insertMentions(
              tr,
              items.filter(item => !toUpdate.has(getKeyForContextItem(item))),
              position,
              separator
          )
        : tr
}

/**
 * Returns all mentions in the document.
 * @param doc The document
 * @returns An array of mentions
 */
export function getMentions(doc: Node): SerializedContextItem[] {
    const mentions: SerializedContextItem[] = []
    doc.descendants(node => {
        if (node.type === schema.nodes.mention) {
            mentions.push(node.attrs.item)
            return false
        }
        return true
    })
    return mentions
}

/**
 * The prompt editor supports different values as {@link MenuItem}s and different types have a
 * different effect on the editor value.
 *
 * Implementation note: When {@link MenuItem} is extended with new types, add a corresponding test
 * to {@see promptInput.test.ts}.
 */
export function handleSelectMenuItem(item: MenuItem, api: MenuSelectionAPI) {
    // ContextMentionProviderMetadata
    // When selecting a provider, we'll update the mentions menu to show the provider's items.
    if ('id' in item) {
        // Clear current mentions value
        api.setAtMentionValue('')
        api.setProvider(item)
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
            (item.providerUri === REMOTE_FILE_PROVIDER_URI &&
                item.mention?.data?.repoName &&
                !item.mention.data.filePath) ||
            (item.providerUri === REMOTE_DIRECTORY_PROVIDER_URI &&
                item.mention?.data?.repoName &&
                !item.mention.data.directoryPath)
        ) {
            // Do not set the selected item as mention if it is repo item from the remote file search provider.
            // Rather keep the provider in place and update the query with repo name so that the provider can
            // start showing the files instead.
            api.setAtMentionValue(item.mention.data.repoName + ':')
            api.resetSelectedMenuItem()
            return
        }
    }

    // When selecting a large file without range, add the selected option as text node with : at the end.
    // This allows users to autocomplete the file path, and provide them with the options to add range.
    if (item.isTooLarge && !item.range) {
        api.setAtMentionValue(contextItemMentionNodeDisplayText(serializeContextItem(item)) + ':')
        return
    }

    if (item.type === 'open-link') {
        // "open-link" items are links to documentation, you can not commit them as mentions.
        api.deleteAtMention()
        // TODO: Raise an event? Enqueue a task? to open the link.
        return
    }

    // In all other cases we'll insert the selected item as a mention node.
    api.replaceAtMentionValue(createMentionNode({ item: serializeContextItem(item) }))
}

function insertMentions(
    tr: Transaction,
    items: SerializedContextItem[],
    position: 'before' | 'after',
    separator: string
): Transaction {
    const mentionNodes: Node[] = []
    const separatorNode = schema.text(separator)
    for (const item of items) {
        mentionNodes.push(createMentionNode({ item }))
        mentionNodes.push(separatorNode)
    }

    if (position === 'before') {
        tr.insert(Selection.atStart(tr.doc).from, mentionNodes)
    } else {
        insertWhitespaceIfNeeded(tr, Selection.atEnd(tr.doc).from)
        tr.insert(Selection.atEnd(tr.doc).from, mentionNodes)
    }
    return tr
}

/**
 * Computes a unique key for a context item that can be used in e.g. a Map.
 *
 * The URI is not sufficient to uniquely identify a context item because the same URI can be used
 * for different types of context items or, in case of openctx, different provider URIs.
 */
function getKeyForContextItem(item: SerializedContextItem): string {
    let key = `${item.uri.toString()}|${item.type}`
    if (item.type === 'openctx') {
        key += `|${item.providerUri}`
    }
    return key
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
