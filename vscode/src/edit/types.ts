/**
 * The intent classification for the edit.
 * Manually determined depending on how the edit is triggered.
 */
export type EditIntent = 'add' | 'edit' | 'fix' | 'doc' | 'new'

/**
 * The edit modes that can be used when applying an edit.
 * - 'edit': Modify selected code in place.
 * - 'insert': Insert new code above the selected code.
 * - 'test': Create a new test file and insert tests there. Used for unit-test command only.
 */
export type EditMode = 'edit' | 'insert' | 'test'
