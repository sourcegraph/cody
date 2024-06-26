/**
 * The intent classification for the edit.
 * Manually determined depending on how the edit is triggered.
 * Using numerical values so telemetry can be recorded on `metadata`
 */
export enum EditIntent {
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
 *  Using numerical values so telemetry can be recorded on `metadata`
 */
export enum EditMode {
    Insert = 1,
    Edit = 2,
}
