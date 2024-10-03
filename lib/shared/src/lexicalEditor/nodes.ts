import type { SerializedLexicalNode, Spread } from 'lexical'
import _ from 'lodash'
import { URI } from 'vscode-uri'
import type {
    ContextItem,
    ContextItemFile,
    ContextItemOpenCtx,
    ContextItemRepository,
    ContextItemSource,
    ContextItemSymbol,
    ContextItemTree,
} from '../codebase-context/messages'
import {
    displayLineRange,
    doRangesIntersect,
    isRangeContained,
    isRangeProperSubset,
    mergeRanges,
} from '../common/range'
import { displayPathBasename } from '../editor/displayPath'

export const CONTEXT_ITEM_MENTION_NODE_TYPE = 'contextItemMention'
export const TEMPLATE_INPUT_NODE_TYPE = 'templateInput'

/**
 * The subset of {@link ContextItem} fields that we need to store to identify and display context
 * item mentions.
 */
export type SerializedContextItem = {
    uri: string
    title?: string
    content?: undefined
    source?: ContextItemSource
} & (
    | Omit<ContextItemFile, 'uri' | 'content' | 'source'>
    | Omit<ContextItemRepository, 'uri' | 'content' | 'source'>
    | Omit<ContextItemTree, 'uri' | 'content' | 'source'>
    | Omit<ContextItemSymbol, 'uri' | 'content' | 'source'>
    | Omit<ContextItemOpenCtx, 'uri' | 'content' | 'source'>
)

export type SerializedTemplateInput = {
    // TODO should these be PromptStrings?
    placeholder: string
}

export type SerializedContextItemMentionNode = Spread<
    {
        type: typeof CONTEXT_ITEM_MENTION_NODE_TYPE
        contextItem: SerializedContextItem
        isFromInitialContext: boolean
        text: string
    },
    SerializedLexicalNode
>

export type SerializedTemplateInputNode = Spread<
    {
        type: typeof TEMPLATE_INPUT_NODE_TYPE
        templateInput: SerializedTemplateInput
    },
    SerializedLexicalNode
>

export function serializeContextItem(
    contextItem: ContextItem | SerializedContextItem
): SerializedContextItem {
    // Make sure we only bring over the fields on the context item that we need, or else we
    // could accidentally include tons of data (including the entire contents of files).
    return {
        ...contextItem,
        uri: contextItem.uri.toString(),

        // Don't include the `content` (if it's present) because it's quite large, and we don't need
        // to serialize it here. It can be hydrated on demand.
        content: undefined,
    }
}

export function deserializeContextItem(contextItem: SerializedContextItem): ContextItem {
    return { ...contextItem, uri: URI.parse(contextItem.uri) } as ContextItem
}

export function isSerializedContextItemMentionNode(
    node: SerializedLexicalNode | null | undefined
): node is SerializedContextItemMentionNode {
    return Boolean(node && node.type === CONTEXT_ITEM_MENTION_NODE_TYPE)
}

export function isSerializedTemplateInputNode(
    node: SerializedLexicalNode | null | undefined
): node is SerializedTemplateInputNode {
    return Boolean(node && node.type === TEMPLATE_INPUT_NODE_TYPE)
}

type Operation = 'modify' | 'create' | 'delete' | 'keep'

interface OperationResult {
    item: SerializedContextItem
    operation: Operation
    update?: SerializedContextItem
}

interface Operations {
    modify: Map<SerializedContextItem, SerializedContextItem>
    delete: Set<SerializedContextItem>
    create: SerializedContextItem[]
}

export function getMentionOperations(
    existing: SerializedContextItem[],
    toAdd: SerializedContextItem[]
): Operations {
    const groups = Array.from(
        new Set([
            ...existing.map(e => `${e.uri}|${e.source}`),
            ...toAdd.map(a => `${a.uri}|${a.source}`),
        ])
    )

    // Process each URI+source separately
    const results = groups.flatMap(group => {
        const [uri, source] = group.split('|')
        const existingForGroup = existing.filter(e => e.uri === uri && e.source === source)
        const toAddForGroup = toAdd.filter(e => e.uri === uri && e.source === source)

        return processGroupedMentions(existingForGroup, toAddForGroup)
    })

    return {
        modify: results.reduce((m, r) => {
            if (r.operation === 'modify' && r.update) {
                m.set(r.item, r.update!)
            }
            return m
        }, new Map()),
        delete: new Set(_(results).filter({ operation: 'delete' }).map('item').value()),
        create: _(results).filter({ operation: 'create' }).map('item').value(),
    }
}

// Given a set of existing and new mentions for the same document, determine the set
// of operations to update the state (e.g. add new mentions, or delete or modify existing ones)
function processGroupedMentions(
    existing: SerializedContextItem[],
    toAdd: SerializedContextItem[]
): OperationResult[] {
    // If existing document has full coverage, keep it and skip
    const existingFullDocumentCoverage = existing.find(item => !item.range)
    if (existingFullDocumentCoverage) {
        return []
    }
    // Check if any new item covers the entire document
    const fullDocumentCoverage = toAdd.find(item => !item.range)
    if (fullDocumentCoverage) {
        // Mark all existing items for deletion and create one new item
        return [
            ...existing.map(item => ({ item, operation: 'delete' as Operation })),
            { item: fullDocumentCoverage, operation: 'create' as Operation },
        ]
    }

    return processExistingMentions(existing, toAdd).concat(processNewMentions(existing, toAdd))
}

// Given a set of existing and new mentions for the same document, determine the set
// of operations to update the existing mentions (e.g. deleting or modifying the range)
function processExistingMentions(
    existing: SerializedContextItem[],
    toAdd: SerializedContextItem[]
): OperationResult[] {
    return existing.map(existingItem => {
        for (const newItem of toAdd) {
            // Just to satisfy the compiler, this was already checked in the caller
            if (!existingItem.range || !newItem.range) continue

            if (isRangeProperSubset(existingItem.range, newItem.range)) {
                return { item: existingItem, operation: 'delete' }
            }

            // If the new item has a meaningful intersection with the existing item
            // (meaning it is not fully contained in the existing item), merge the two
            if (
                doRangesIntersect(existingItem.range, newItem.range) &&
                !isRangeContained(newItem.range, existingItem.range)
            ) {
                return {
                    operation: 'modify',
                    item: existingItem,
                    update: mergeContextItems(existingItem, newItem),
                }
            }
        }

        // If no new item overlaps with the existing item, keep it
        return {
            item: existingItem,
            operation: 'keep',
        }
    })
}

// Given a set of existing and new mentions for the same document, determine which
// new mentions should be added due to non-overlapping ranges
function processNewMentions(
    existing: SerializedContextItem[],
    toAdd: SerializedContextItem[]
): OperationResult[] {
    return toAdd
        .filter(newItem =>
            existing.every(
                existingItem =>
                    // These are just to satisfy the compiler, they were already checked in the caller
                    existingItem.range &&
                    newItem.range &&
                    // if the new item is partially contained in an existing item,
                    // we won't need to add it as it will have been handled by a modify operation
                    // but if it completely subsumes an existing item, we need to add it
                    // as the existing item will be deleted
                    (!doRangesIntersect(newItem.range, existingItem.range) ||
                        isRangeProperSubset(existingItem.range, newItem.range))
            )
        )
        .map(item => ({
            item,
            operation: 'create',
        }))
}

function mergeContextItems(a: SerializedContextItem, b: SerializedContextItem): SerializedContextItem {
    // If one of the ranges is undefined, then it references the entire item
    // so we can just return that item
    if (!a.range || !b.range) {
        return a.range ? b : a
    }

    return {
        ...a,
        size: getMergedSize(a, b),
        range: mergeRanges(a.range, b.range),
    }
}

// This may overestimate the size of the context item, but it's the best
// we can do without reloading the content and recounting.
function getMergedSize(first: SerializedContextItem, second: SerializedContextItem): number | undefined {
    if (first.size === undefined && second.size === undefined) {
        return undefined
    }
    const firstSize = first.size ?? 0
    const secondSize = second.size ?? 0
    // If either mention subsumes the other, we can just return the size of the subsuming item
    if (doesSerializedContextItemSubsume(first, second)) {
        return Math.max(firstSize, secondSize)
    }
    return firstSize + secondSize
}

function doesSerializedContextItemSubsume(a: SerializedContextItem, b: SerializedContextItem): boolean {
    // If exactly one of the ranges is undefined, then it references the entire item
    // and is overlapping
    if ((!a.range && b.range) || (!b.range && a.range)) {
        return true
    }

    // If they both refer to entire item, then they are subsuming each other
    if (!a.range || !b.range) {
        return true
    }

    return isRangeContained(a.range, b.range) || isRangeContained(b.range, a.range)
}

export function contextItemMentionNodeDisplayText(contextItem: SerializedContextItem): string {
    // A displayed range of `foo.txt:2-4` means "include all of lines 2, 3, and 4", which means the
    // range needs to go to the start (0th character) of line 5. Also, `RangeData` is 0-indexed but
    // display ranges are 1-indexed.
    const rangeText = contextItem.range?.start ? `:${displayLineRange(contextItem.range)}` : ''
    switch (contextItem.type) {
        case 'file':
            if (contextItem.provider && contextItem.title) {
                return contextItem.title
            }
            return `${decodeURIComponent(displayPathBasename(URI.parse(contextItem.uri)))}${rangeText}`

        case 'repository':
            return trimCommonRepoNamePrefixes(contextItem.repoName) ?? 'unknown repository'

        case 'tree':
            return contextItem.name ?? 'unknown folder'

        case 'symbol':
            return contextItem.symbolName

        case 'openctx':
            return contextItem.title
    }
    // @ts-ignore
    throw new Error(`unrecognized context item type ${contextItem.type}`)
}

export function templateInputNodeDisplayText(templateInput: SerializedTemplateInputNode): string {
    return templateInput.templateInput.placeholder
}

function trimCommonRepoNamePrefixes(repoName: string): string {
    return repoName.replace(/^(github|gitlab)\.com\//, '')
}
