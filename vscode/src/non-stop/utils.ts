export enum CodyTaskState {
    idle = 1,
    working = 2,
    inserting = 3,
    applying = 4,
    formatting = 5,
    applied = 6,
    finished = 7,
    error = 8,
    pending = 9,
}

export function isTerminalCodyTaskState(state: CodyTaskState): boolean {
    switch (state) {
        case CodyTaskState.finished:
        case CodyTaskState.error:
            return true
        default:
            return false
    }
}
