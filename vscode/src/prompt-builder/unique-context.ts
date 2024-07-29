import type { ContextItem, ContextItemOpenCtx } from '@sourcegraph/cody-shared'
import { rangeContainsLines, rangesOnSameLines } from '../common/range'
import { getContextItemDisplayPath, getContextItemTokenUsageType } from './utils'

/**
 * Filters exisiting context items for uniqueness.
 *
 * NOTE: The transcript is reversed during the prompt-building process to ensure
 * that the most recent items are considered first. Therefore, the `reversedItems`
 * parameter should be in reverse order.
 *
 * @param reversedItems - The list of ContextItem to filter for uniqueness.
 * @returns A new array of unique ContextItem instances.
 */
export function getUniqueContextItems(reversedItems: ContextItem[]): ContextItem[] {
    let uniqueItems: ContextItem[] = []

    for (const itemToAdd of reversedItems) {
        const itemToAddPath = getContextItemDisplayPath(itemToAdd)

        // Skip non-unique items.
        if (!isUniqueContextItem(itemToAdd, uniqueItems)) {
            continue
        }

        // Filter non-unique items from items with the same display path:
        // - when the new item's range contains the existing item's range,
        // - when the existing item's range contains the new item's range,
        // - when the new item is a user-added item with a different source.
        uniqueItems = uniqueItems.filter(
            item =>
                getContextItemDisplayPath(item) !== itemToAddPath ||
                !item.range ||
                (itemToAdd.range && !rangeContainsLines(itemToAdd.range, item.range)) ||
                maybeAllowedAnnotationOverlap(itemToAdd, item) ||
                (isUserAddedItem(item) && itemToAdd.source !== item.source)
        )

        uniqueItems.push(itemToAdd) // Add the current item to the list of unique items
    }

    return uniqueItems
}

/**
 * Determines if a given `ContextItem` is unique among the existing context items.
 *
 * This function checks for duplicates based on the display path and ranges.
 * It ensures that the ranges of the items do not overlap or contain each other.
 *
 * @param itemToAdd - The ContextItem to check for uniqueness.
 * @param uniqueItems - The list of existing context items to check against.
 * @returns boolean whether the `itemToAdd` is unique.
 */
export function isUniqueContextItem(itemToAdd: ContextItem, uniqueItems: ContextItem[]): boolean {
    const itemToAddDisplayPath = getContextItemDisplayPath(itemToAdd)
    const itemToAddRange = itemToAdd.range

    for (const item of uniqueItems) {
        // Check for existing items with the same display path
        if (getContextItemDisplayPath(item) === itemToAddDisplayPath) {
            const itemRange = item.range

            // Assume context with no range contains full file content (unique)
            if (item === itemToAdd || (!itemRange && !isUserAddedItem(itemToAdd))) {
                return false // Duplicate found.
            }

            // Skip non-duplicated user-added item.
            if (isUserAddedItem(itemToAdd) && !isUserAddedItem(item)) {
                continue
            }

            // Duplicates if overlapping ranges on the same lines,
            // or if one range contains the other.
            if (itemToAddRange && itemRange) {
                if (
                    (rangesOnSameLines(itemRange, itemToAddRange) ||
                        rangeContainsLines(itemRange, itemToAddRange)) &&
                    !maybeAllowedAnnotationOverlap(itemToAdd, item)
                ) {
                    return false
                }
            }

            // Duplicates if whole file (undefined range) and selection has the
            // same content.
            if (!itemToAddRange && equalTrimmedContent(item, itemToAdd)) {
                return false
            }
        }
    }

    return true // No conflicts are found.
}

/**
 * If the context item is a user-added item:
 * - `user` - The item was added by the user through `@`-mentions or other user input.
 * - `selection` - The item was added by the user through a selection.
 */
function isUserAddedItem(item: ContextItem): boolean {
    return getContextItemTokenUsageType(item) === 'user'
}

/**
 * Checks if content is set and equal.
 */
function equalTrimmedContent(item1: ContextItem, item2: ContextItem): boolean {
    return !!item1.content && !!item2.content && item1.content.trim() === item2.content.trim()
}

/**
 * Checks if either of the items is an annotation and if the two are allowed to overlap.
 * The check is `true` for cases when:
 * - Only *one of the items is an annotation*, since annotations will naturally overlap with other
 * items, such as file-mentions.
 * - Both items are annotations, but returned by *different providers*.
 *
 * For all other cases the check is `false`. This also includes the case where both items are non-annotations.
 * The client code is free to overrule this case based on some other logic.
 *
 * @param item1 context item overlapping `item2`
 * @param item2 context item overlapping `item1`
 */
function maybeAllowedAnnotationOverlap(item1: ContextItem, item2: ContextItem): boolean {
    const isAnnotation = (item: ContextItem): item is ContextItemOpenCtx =>
        item.type === 'openctx' && item.kind === 'annotation'

    // Items may overlap if only one is an annotation.
    if (isAnnotation(item1) !== isAnnotation(item2)) {
        return true
    }

    // Non-annotations cannot overlap.
    if (!(isAnnotation(item1) && isAnnotation(item2))) {
        return false
    }

    return item1.providerUri !== item2.providerUri
}
