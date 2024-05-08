import {
    type ContextItem,
    type RangeData,
    displayPath as getDisplayPath,
} from '@sourcegraph/cody-shared'
import { getContextItemTokenUsageType } from './utils'

/**
 * Filters exisiting context items for uniqueness.
 *
 * NOTE: The transcript is reversed during the prompt-building process to ensure
 * that the most recent items are considered first. Therefre, the `reversedItems`
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
            // Assume context with no range contains full file content (unique)
            if (item === itemToAdd || !item.range) {
                return false // Duplicate found.
            }

            // Duplicates if overlapping ranges on the same lines,
            // or if one range contains the other.
            if (item.range && itemToAddRange) {
                return !(
                    rangesOnSameLines(item.range, itemToAddRange) ||
                    rangeContainsLines(item.range, itemToAddRange)
                )
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
 * Returns the display path for a context item.
 *
 * For unified items, the title is used as the display path.
 * For other items, the URI is used.
 */
function getContextItemDisplayPath(item: ContextItem): string {
    return item.source === 'unified' && item.title ? item.title : getDisplayPath(item.uri)
}

/**
 * If the context item is a user-added item:
 * - `user` - The item was added by the user through @-mentions or other user input.
 * - `selection` - The item was added by the user through a selection.
 */
function isUserAddedItem(item: ContextItem): boolean {
    return getContextItemTokenUsageType(item) === 'user'
}
