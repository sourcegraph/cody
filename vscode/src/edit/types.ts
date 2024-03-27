/**
 * The intent classification for the edit.
 * Manually determined depending on how the edit is triggered.
 */
export type EditIntent = 'add' | 'edit' | 'fix' | 'doc' | 'test'

/**
 * The edit modes that can be used when applying an edit.
 * - 'edit': Modify selected code in place.
 * - 'insert': Insert new code at the selected location.
 */
export type EditMode = 'edit' | 'insert'
