import { CodyTaskState } from '../utils'

export const CANCELABLE_TASK_STATES = [
    CodyTaskState.pending,
    CodyTaskState.working,
    CodyTaskState.inserting,
    CodyTaskState.applying,
]

export const ACTIONABLE_TASK_STATES = [
    // User can Accept, Undo, Retry, etc
    CodyTaskState.applied,
]

/**
 * The task states where there is a direct command that the users is likely to action.
 * This is used to help enable/disable keyboard shortcuts depending on the states in the document
 */
export const ALL_ACTIONABLE_TASK_STATES = [...ACTIONABLE_TASK_STATES, ...CANCELABLE_TASK_STATES]
