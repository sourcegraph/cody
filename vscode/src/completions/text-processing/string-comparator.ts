import levenshtein from 'js-levenshtein'

/**
 * Compares string by editing distance algorithm, returns true
 * whenever string are almost the same, means that strings are
 * the same if we can apply less than MAX_NUMBER_EDITS to the stringA
 * to convert it to the stringB. There are three possible types of edit
 * - Substitution
 * - Insertion
 * - Deletion
 *
 * For more details see https://en.wikipedia.org/wiki/Levenshtein_distance
 */
export const isAlmostTheSameString = (stringA: string, stringB: string, percentage: number = 0.2): boolean => {
    const maxLength = Math.max(stringA.length, stringB.length)
    const editOperations = LevenshteinCompare(stringA, stringB)

    // Strings are the same
    if (editOperations === 0) {
        return true
    }

    const operationToLength = editOperations / maxLength

    return percentage > operationToLength
}

/**
 * Returns minimal number of edits (Substitution, Insertion, Deletion)
 * to covert a to b. For simplicity, we take for a fact that all edits
 * have the same weight/cost.
 *
 * Example:
 * Let's have strings "EDITING" and "DISTANCE"
 *
 * 1 2 3 4 5 6 7 8 9
 * E D I - T I N G -
 * - D I S T A N C E
 *
 * Edit cost is 5 because
 * - Delete symbol at index 1 (cost = 1)
 * - Insert symbol S at index 4 (cost = 2)
 * - Replace at index 6 (cost = 3)
 * - Replace at index 8 (cost = 4)
 * - Insert at index 9 (cost = 5)
 */
export function LevenshteinCompare(A: string, B: string): number {
    return levenshtein(A, B)
}
