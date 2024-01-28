/**
 * The intent classification for the edit.
 * Manually determined depending on how the edit is triggered.
 */
export type EditIntent = 'add' | 'edit' | 'fix' | 'doc' | 'new'

/**
 * The edit modes that can be used when applying an edit.
 * - 'edit': Modify selected code in place.
 * - 'insert': Insert new code above the selected code.
 * - 'file': Create a new file and insert code there..
 */
export type EditMode = 'edit' | 'insert' | 'file'
