export enum CodyTaskState {
    'idle' = 1,
    'working' = 2,
    'applying' = 3,
    'applied' = 4,
    'finished' = 5,
    'error' = 6,
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
    [CodyTaskState.applying]: {
        id: 'applying',
        icon: 'pencil',
        description: 'The edit is being applied to the document',
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

/**
 * Get the last part of the file path after the last slash
 */
export function getFileNameAfterLastDash(filePath: string): string {
    const lastDashIndex = filePath.lastIndexOf('/')
    if (lastDashIndex === -1) {
        return filePath
    }
    return filePath.slice(lastDashIndex + 1)
}
