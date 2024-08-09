import { CodyTaskState } from '../state'

export const ACTIVE_TASK_STATES = [
    CodyTaskState.Pending,
    CodyTaskState.Working,
    CodyTaskState.Inserting,
    CodyTaskState.Applying,
]

export const ACTIONABLE_TASK_STATES = [
    // User can Accept, Undo, Retry, etc
    CodyTaskState.Applied,
]

/**
 * States at which we consider an Edit to be "terminated"
 * Considers both "Applied" and "Error" to be terminal, so that we can encourage the user along
 * into the next steps, even when they don't necessarily hit a happy-path
 */
export const TERMINAL_EDIT_STATES = [CodyTaskState.Applied, CodyTaskState.Finished, CodyTaskState.Error]

/**
 * The task states where there is a direct command that the users is likely to action.
 * This is used to help enable/disable keyboard shortcuts depending on the states in the document
 */
export const ALL_ACTIONABLE_TASK_STATES = [...ACTIONABLE_TASK_STATES, ...ACTIVE_TASK_STATES]
