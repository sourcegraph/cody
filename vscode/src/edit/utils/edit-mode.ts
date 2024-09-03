import type { EditIntent, EditMode } from '../types'

const DEFAULT_EDIT_MODE: EditMode = 'edit'

export function getEditMode(intent: EditIntent, proposedMode?: EditMode): EditMode {
    if (intent === 'add') {
        // Always ensure that we use the `insert` mode for the edit intent.
        return 'insert'
    }

    return proposedMode || DEFAULT_EDIT_MODE
}
