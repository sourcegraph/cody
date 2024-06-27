/**
 * The intent classification for the edit.
 * Manually determined depending on how the edit is triggered.
 */
export type EditIntent = 'add' | 'edit' | 'fix' | 'doc' | 'test'

/**
 * Create a mapping of all source types to numerical values, so telemetry can be recorded on `metadata`.
 */
export enum EditIntentMetadataMapping {
    Add = 1,
    Edit = 2,
    Fix = 3,
    Doc = 4,
    Test = 5,
}

/**
 * The edit modes that can be used when applying an edit.
 * - 'edit': Modify selected code in place.
 * - 'insert': Insert new code at the selected location.
 */
export type EditMode = 'edit' | 'insert'

export enum EditModeMetadataMapping {
    Insert = 1,
    Edit = 2,
}
