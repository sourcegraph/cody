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
export const isAlmostTheSameString = (stringA: string, stringB: string, percentage: number = 0.33): boolean => {
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
    // Invariants and common cases checks
    if (A === B) {
        return 0
    }

    if (A.length === 0) {
        return B.length
    }

    if (B.length === 0) {
        return A.length
    }

    // Edit matrix by (B length + 1) on (A length + 1)
    const matrix: number[][] = []

    // Populate matrix with initial values
    // prefill first column with symbol indexes
    for (let m = 0; m <= B.length; m++) {
        matrix[m] = []

        if (m === 0) {
            matrix[0] = A.split('').map((_, index) => index)
        } else {
            matrix[m][0] = m
        }
    }

    for (let n = 1; n <= B.length; ++n) {
        for (let m = 1; m <= A.length; ++m) {
            if (B[n - 1] === A[m - 1]) {
                // Symbols are equal the minimal number of operations
                // stays the same as it was on previous step
                matrix[n][m] = matrix[n - 1][m - 1]
            } else {
                const deletion = matrix[n - 1][m]
                const insertion = matrix[n][m - 1]
                const substitution = matrix[n - 1][m - 1]

                matrix[n][m] = Math.min(deletion, insertion, substitution) + 1
            }
        }
    }

    return matrix[B.length][A.length]
}
