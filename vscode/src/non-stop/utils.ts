export enum CodyTaskState {
    'idle' = 1,
    'working' = 2,
    'inserting' = 3,
    'applying' = 4,
    'formatting' = 5,
    'applied' = 6,
    'finished' = 7,
    'error' = 8,
}

export type CodyTaskList = {
    [key in CodyTaskState]: {
        id: string
        icon: string
        description: string
    }
}

/**
 * Icon for each task state
 */
export const fixupTaskList: CodyTaskList = {
    [CodyTaskState.idle]: {
        id: 'idle',
        icon: 'clock',
        description: 'Initial state',
    },
    [CodyTaskState.working]: {
        id: 'working',
        icon: 'sync~spin',
        description: 'Cody is preparing a response',
    },
    [CodyTaskState.inserting]: {
        id: 'inserting',
        icon: 'pencil',
        description: 'The edit is being inserted to the document',
    },
    [CodyTaskState.applying]: {
        id: 'applying',
        icon: 'pencil',
        description: 'The edit is being applied to the document',
    },
    [CodyTaskState.formatting]: {
        id: 'formatting',
        icon: 'pencil',
        description: 'The edit is being formatted in the document',
    },
    [CodyTaskState.applied]: {
        id: 'applied',
        icon: 'pass-filled',
        description: 'Suggestions from Cody have been applied',
    },
    [CodyTaskState.finished]: {
        id: 'finished',
        icon: 'pass-filled',
        description: 'The edit has been resolved and is no longer visible in the document',
    },
    [CodyTaskState.error]: {
        id: 'error',
        icon: 'stop',
        description: 'The task failed',
    },
}
