import {
    type ContextItem,
    type RangeData,
    displayPath as getDisplayPath,
} from '@sourcegraph/cody-shared'
import { getContextItemTokenUsageType } from './utils'

/**
 * Returns a new array of `ContextItem` instances that are unique compared to
 * the provided list of existing `ContextItem`.
 *
 * NOTE: The transcript is reversed during the prompt-building process to ensure
 * that the most recent items are considered first. Therefre, the `reversedItems`
 * parameter should be in reverse order.
 *
 * @param reversedItems - The list of ContextItem to filter for uniqueness.
 * @returns A new array of unique ContextItem instances.
 */
export function getUniqueContextItems(reversedItems: ContextItem[]): ContextItem[] {
    const uniqueItems: ContextItem[] = []

    for (const itemToAdd of reversedItems) {
        if (isUniqueContextItem(itemToAdd, uniqueItems)) {
            removeNonUniqueItems(itemToAdd, uniqueItems)
            uniqueItems.push(itemToAdd)
        }
    }

    return uniqueItems
}

/**
 * Removes non-unique items from the list of `ContextItem` instances.
 */
function removeNonUniqueItems(itemToAdd: ContextItem, uniqueItems: ContextItem[]): void {
    // Check if the item can be removed from the unique list.
    // An item can be removed if it is not user-added or have the same source as the item to add.
    const canRemoveItem = (itemToRemove: ContextItem): boolean =>
        !isUserAddedItem(itemToRemove) || itemToAdd.source === itemToRemove.source

    // Check for duplicates by looping through the unique items in reverse,
    // so we can process the most recent items first.
    for (let i = uniqueItems.length - 1; i >= 0; i--) {
        // Current unique item to check against.
        const item = uniqueItems[i]

        // Skip items with different display paths.
        if (getContextItemDisplayPath(item) !== getContextItemDisplayPath(itemToAdd)) {
            continue
        }

        // Continue looping to ensure the item of full file is unique.
        if (!itemToAdd.range) {
            // Since the itemToAdd will be added to the unique list at the end,
            // but we will keep looping to ensure all remaing items are removed.
            canRemoveItem(item) && uniqueItems.splice(i, 1)
            continue
        }

        // The item contains content of the unique item that makes it not-unique (duplicate),
        // so we will remove the unique item from the unique list if it is not user-added.
        if (item.range && rangeContainsLines(itemToAdd.range, item.range)) {
            canRemoveItem(item) && uniqueItems.splice(i, 1)
        }
    }
}

/**
 * Determines if a given `ContextItem` is unique among a list of `ContextItem` instances.
 *
 * This function checks for duplicates based on the display path and range of the `ContextItem` instances.
 * It ensures that the ranges of the `ContextItem` do not overlap or contain each other.
 *
 * @param itemToAdd - The ContextItem to check for uniqueness.
 * @param uniqueItems - The list of unique ContextItem to check against.
 * @returns boolean weather the `itemToAdd` is unique.
 */
export function isUniqueContextItem(itemToAdd: ContextItem, items: ContextItem[]): boolean {
    const itemToAddDisplayPath = getContextItemDisplayPath(itemToAdd)
    const itemToAddRange = itemToAdd.range

    // Check for duplicates by looping through the unique items in reverse,
    // so we can process the most recent items first.
    for (const item of items) {
        // Skip items with different display paths.
        if (getContextItemDisplayPath(item) !== itemToAddDisplayPath) {
            continue
        }

        // Assume context with no range contains full file content (unique),
        // unless there is also an item without a range a full file (duplicate).
        if (item === itemToAdd || !item.range) {
            return false // Duplicate found.
        }

        // Continue looping to ensure the item of full file is unique.
        if (!itemToAddRange) {
            continue
        }

        if (rangesOnSameLines(item.range, itemToAddRange)) {
            return false // Overlapping ranges on the same lines.
        }

        if (rangeContainsLines(item.range, itemToAddRange)) {
            return false // The unique item's range contains content from item.
        }
    }

    return true
}

function rangeContainsLines(outerRange: RangeData, innerRange: RangeData): boolean {
    return outerRange.start.line <= innerRange.start.line && outerRange.end.line >= innerRange.end.line
}

function rangesOnSameLines(range1: RangeData, range2: RangeData): boolean {
    return range1.start.line === range2.start.line && range1.end.line === range2.end.line
}

function getContextItemDisplayPath(item: ContextItem): string {
    return item.source === 'unified' && item.title ? item.title : getDisplayPath(item.uri)
}

function isUserAddedItem(item: ContextItem): boolean {
    return getContextItemTokenUsageType(item) === 'user'
}
