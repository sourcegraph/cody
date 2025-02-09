import type { ToolCallArgs, ToolInvocation } from './tool-service'

type UUID = `${string}-${string}-${string}-${string}-${string}`

export type ThreadID = `T-${UUID}`

export type ThreadStepID = `S-${UUID}`

export function newThreadID(): ThreadID {
    return `T-${crypto.randomUUID()}`
}

export function isThreadID(id: string): id is ThreadID {
    return id.startsWith('T-')
}

export function newThreadStepID(): ThreadStepID {
    return `S-${crypto.randomUUID()}`
}

export function isThreadStepID(id: string): id is ThreadStepID {
    return id.startsWith('S-')
}

export type ThreadStep = { id: ThreadStepID } & (
    | { type: 'human-message'; content: string }
    | {
          type: 'agent-message'
          content: string
      }
    | {
          type: 'think'
          content?: string
          pending?: boolean
      }
    | {
          type: 'tool'
          tool: string
          args: ToolCallArgs | null
      }
    | { type: 'agent-turn-done' }
)

export interface InteractiveThread {
    /** The thread ID. */
    id: ThreadID

    /**
     * A monotonically increasing integer that represents the version of this data. Each time the
     * rest of the data structure changes, this field is incremented.
     */
    // TODO!(sqs): v: number

    /**
     * The contents of the thread.
     */
    steps: ThreadStep[]

    /**
     * The tool invocations associated with tool-call steps.
     */
    toolInvocations?: Record<ThreadStepID, ToolInvocation>

    /**
     * User input provided for steps that require it.
     *
     * TODO(sqs): Currently we only support asking the user to accept or reject an invocation (such
     * as for a terminal command).
     */
    userInput?: Record<ThreadStepID, ThreadStepUserInput>
}

export interface ThreadStepUserInput {
    accepted: boolean
}

export function toolCallInfo(
    thread: Pick<InteractiveThread, 'toolInvocations' | 'userInput'>,
    step: ThreadStepID
): {
    toolInvocation: ToolInvocation | undefined
    userInput: ThreadStepUserInput | undefined
} {
    return { toolInvocation: thread.toolInvocations?.[step], userInput: thread.userInput?.[step] }
}
