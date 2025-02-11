import { type Observable, Subject } from 'observable-fns'
import { concat, filter, promiseFactoryToObservable } from '../../misc/observable'
import type { BuiltinTools } from './builtin-tools'
import {
    type InteractiveThread,
    type ThreadID,
    type ThreadStep,
    type ThreadStepID,
    type ThreadStepUserInput,
    newThreadStepID,
} from './thread'
import type { ThreadEntry, ThreadStorage } from './thread-storage'
import type { ToolInvocation } from './tool-service'

export interface InteractiveThreadService {
    /**
     * Observe a chat thread. The returned {@link Observable} emits whenever there are any changes
     * to the chat thread.
     */
    observe(threadID: ThreadID, options: ObserveThreadOptions): Observable<InteractiveThread | null>

    /**
     * Perform an update action on the thread.
     *
     * It returns the updated thread. Callers should use the returned thread instead of the one
     * emitted by {@link InteractiveThreadService.observe}'s observable until the observable emits a
     * newer version.
     */
    update(threadID: ThreadID, update: ThreadUpdate): Promise<InteractiveThread>

    /**
     * Observe the history of all threads.
     */
    observeHistory(): Observable<ThreadEntry[]>
}

interface ObserveThreadOptions {
    /**
     * If true, a new thread is created with the given ID. An error is thrown if a thread with that
     * ID already exists.
     */
    create?: boolean

    // TODO!(sqs): remove this probably
    getOrCreate?: boolean
}

export type ThreadUpdate =
    | {
          type: 'append-human-message'
          content: string
      }
    | {
          type: 'append-agent-steps'
          steps: Exclude<ThreadStep, { type: 'human-message' }>[]
      }
    | {
          type: 'user-input'
          step: ThreadStepID
          value: ThreadStepUserInput
      }
    | {
          type: 'update-tool-invocation'
          step: ThreadStepID
          invocation: ToolInvocation['invocation']
      }
    | { type: 'ping' }

export function createInteractiveThreadService(storage: ThreadStorage): InteractiveThreadService {
    const updates = new Subject<InteractiveThread>()

    async function update(threadID: ThreadID, update: ThreadUpdate): Promise<InteractiveThread> {
        const prev = await storage.get(threadID)
        if (!prev) {
            throw new Error(`thread ${threadID} not found`)
        }
        const thread = JSON.parse(JSON.stringify(prev)) as InteractiveThread // copy

        updateThread(thread, update)

        await storage.set(threadID, thread)
        updates.next(thread)
        return thread
    }

    return {
        observe(
            threadID: ThreadID,
            options: ObserveThreadOptions
        ): Observable<InteractiveThread | null> {
            const initialValue = promiseFactoryToObservable(async signal => {
                let thread = await storage.get(threadID)
                signal?.throwIfAborted()

                if (options.create && !thread) {
                    throw new Error(`thread ${threadID} already exists`)
                }
                if ((options.create || options.getOrCreate) && !thread) {
                    thread = {
                        v: 0,
                        id: threadID,
                        created: Date.now(),
                        steps: [],
                    }
                    await storage.set(thread.id, thread)
                    updates.next(thread)
                    signal?.throwIfAborted()
                }
                return thread
            })
            const changes = updates.pipe(
                filter((thread): thread is InteractiveThread => thread.id === threadID)
            )
            return concat(initialValue, changes)
        },
        update: singleFlight(update),
        observeHistory(): Observable<ThreadEntry[]> {
            return storage.list()
        },
    }
}

/**
 * Update (mutating in-place) {@link thread}.
 */
function updateThread(thread: InteractiveThread, update: ThreadUpdate): void {
    console.log('X updateThread', update, thread)

    thread.v++

    function resetToolInvocation(
        step: Extract<ThreadStep, { type: 'tool' }>,
        userInput: ThreadStepUserInput | undefined
    ): ToolInvocation {
        if (!thread.toolInvocations) {
            thread.toolInvocations = {}
        }
        const toolInvocation: ToolInvocation = {
            args: step.args,
            userInput,
            meta: undefined,
            invocation: { status: 'queued' },
        }
        thread.toolInvocations[step.id] = toolInvocation
        return toolInvocation
    }

    switch (update.type) {
        case 'append-human-message':
            thread.steps = [
                ...thread.steps,
                { id: newThreadStepID(), type: 'human-message', content: update.content },
            ]
            break
        case 'append-agent-steps':
            {
                thread.steps = [...thread.steps, ...update.steps]

                // Invoke tools for any new tool-call steps.
                for (const step of update.steps) {
                    if (step.type === 'tool') {
                        const invocation = resetToolInvocation(step, undefined)
                        // TODO!(sqs)
                        if (step.tool === 'edit-file') {
                            invocation.meta = {
                                diffStat: { added: 37, changed: 3, deleted: 1 },
                            } as BuiltinTools['edit-file']['meta']
                        }
                    }
                }
            }
            break
        case 'user-input':
            {
                const step = thread.steps.find(step => step.id === update.step)
                if (!step) {
                    throw new Error(`step ${update.step} not found`)
                }
                if (!thread.userInput) {
                    thread.userInput = {}
                }
                thread.userInput[update.step] = update.value

                if (step.type === 'tool') {
                    resetToolInvocation(step, update.value)
                }
            }
            break
        case 'update-tool-invocation':
            {
                const toolInvocation = thread.toolInvocations?.[update.step]
                if (!toolInvocation) {
                    throw new Error(`tool invocation ${update.step} not found`)
                }
                toolInvocation.invocation = update.invocation
            }
            break
        case 'ping':
            break
    }
}

/**
 * Creates a single-flighted version of a function where only one call can be in flight at a time.
 * Subsequent calls are queued and executed in order after the current call completes.
 */
function singleFlight<T, Args extends any[]>(
    fn: (...args: Args) => Promise<T>
): (...args: Args) => Promise<T> {
    const queue: Array<{
        args: Args
        resolve: (value: T | PromiseLike<T>) => void
        reject: (reason?: any) => void
    }> = []
    let inFlight = false

    return async (...args: Args): Promise<T> => {
        return new Promise((resolve, reject) => {
            queue.push({ args, resolve, reject })
            void processQueue()
        })
    }

    async function processQueue(): Promise<void> {
        if (inFlight || queue.length === 0) {
            return
        }

        inFlight = true
        const { args, resolve, reject } = queue.shift()!

        try {
            const result = await fn(...args)
            resolve(result)
        } catch (error) {
            reject(error)
        } finally {
            inFlight = false
            void processQueue()
        }
    }
}
