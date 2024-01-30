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

/**
 * The source of the edit range.
 * - 'selection': The users' selection in their editor.
 * - 'expanded': An expanded selection, derived from the users' selection to the nearest block of code.
 * - 'maximum': The maximum possible selection for the given file that still can be used as context.
 */
export type EditRangeSource = 'position' | 'selection' | 'expanded' | 'maximum'
