import type { ContextItem, RangeData } from '@sourcegraph/cody-shared'
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
                    rangesOnSameLines(itemRange, itemToAddRange) ||
                    rangeContainsLines(itemRange, itemToAddRange)
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
 * Checks if the outer range contains the inner range:
 * - The start of the outer range is less than or equal to the start of the inner range.
 * - The end of the outer range is greater than or equal to the end of the inner range.
 */
function rangeContainsLines(outerRange: RangeData, innerRange: RangeData): boolean {
    return outerRange.start.line <= innerRange.start.line && outerRange.end.line >= innerRange.end.line
}

/**
 * Checks if both ranges are on the same lines.
 */
function rangesOnSameLines(range1: RangeData, range2: RangeData): boolean {
    return range1.start?.line === range2.start?.line && range1.end?.line === range2.end?.line
}

/**
 * If the context item is a user-added item:
 * - `user` - The item was added by the user through @-mentions or other user input.
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
