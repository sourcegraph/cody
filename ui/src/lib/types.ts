import type { ThreadID, ThreadStep, ThreadStepID, ThreadUpdate } from '@sourcegraph/cody-shared'
export type { ThreadStep, ThreadUpdate, ThreadID, ThreadStepID }

// TODO!(sqs): handle errors
export type ThreadUpdateCallback<T extends ThreadUpdate['type'] = any> = (
    update: Extract<ThreadUpdate, { type: T }>
) => void
