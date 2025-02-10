import { Observable } from 'observable-fns'
import type { Memento } from 'vscode'
import { NEVER, concat } from '../../misc/observable'
import type { BuiltinTools } from './builtin-tools'
import {
    type InteractiveThread,
    type ThreadID,
    type ThreadStep,
    type ThreadStepID,
    type ThreadStepUserInput,
    isThreadID,
    newThreadStepID,
} from './thread'
import type { ToolInvocation } from './tool-service'

export interface InteractiveThreadService {
    /**
     * Observe a chat thread. The returned {@link Observable} emits whenever there are any changes
     * to the chat thread.
     */
    observe(threadID: ThreadID, options: ObserveThreadOptions): Observable<InteractiveThread>

    /**
     * Perform an update action on the thread.
     *
     * It returns the updated thread. Callers should use the returned thread instead of the one
     * emitted by {@link InteractiveThreadService.observe}'s observable until the observable emits a
     * newer version.
     */
    update(threadID: ThreadID, update: ThreadUpdate): Promise<InteractiveThread>

    observeHistoryThreadIDs(): Observable<ThreadID[]>
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

interface ThreadStorage {
    get(threadID: InteractiveThread['id']): InteractiveThread | null
    store(thread: InteractiveThread): void
}

export function mapThreadStorage(): ThreadStorage {
    const storage = new Map<ThreadID, InteractiveThread>()
    return {
        get(threadID) {
            return storage.get(threadID) ?? null
        },
        store(thread) {
            storage.set(thread.id, thread)
        },
    }
}

export function localStorageThreadStorage(storage: Storage): ThreadStorage {
    return {
        get(threadID) {
            const stored = storage.getItem(`thread:${threadID}`)
            return stored ? JSON.parse(stored) : null
        },
        store(thread) {
            storage.setItem(`thread:${thread.id}`, JSON.stringify(thread))
        },
    }
}

export function createInteractiveThreadService(storage: Memento): InteractiveThreadService {
    const subscribers = new Map<ThreadID, Set<(thread: InteractiveThread) => void>>()

    return {
        observe(threadID: ThreadID, options: ObserveThreadOptions): Observable<InteractiveThread> {
            return new Observable<InteractiveThread>(subscriber => {
                let thread = storage.get<InteractiveThread>(threadID)
                if (options.create && !thread) {
                    throw new Error(`thread ${threadID} already exists`)
                }
                if ((options.create || options.getOrCreate) && !thread) {
                    thread = {
                        // v: 0, TODO!(sqs)
                        id: threadID,
                        steps: [],
                    }
                    storage.update(thread.id, thread) // TODO!(sqs): await
                }

                if (!thread) {
                    throw new Error(`thread ${threadID} not found`)
                }

                const callback = (thread: InteractiveThread) => subscriber.next(thread)
                if (!subscribers.has(threadID)) {
                    subscribers.set(threadID, new Set())
                }
                subscribers.get(threadID)!.add(callback)

                subscriber.next(thread)
                return () => {
                    subscribers.get(threadID)?.delete(callback)
                }
            })
        },

        async update(threadID: ThreadID, update: ThreadUpdate): Promise<InteractiveThread> {
            const prev = storage.get(threadID)
            if (!prev) {
                throw new Error(`thread ${threadID} not found`)
            }

            const thread = JSON.parse(JSON.stringify(prev)) as InteractiveThread
            // thread.v++ TODO!(sqs)

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

            await storage.update(thread.id, thread)
            for (const callback of subscribers.get(threadID) ?? []) {
                callback(thread)
            }
            return thread
        },
        observeHistoryThreadIDs(): Observable<ThreadID[]> {
            const threadIDs = storage.keys().filter(isThreadID)
            return concat(Observable.of(threadIDs), NEVER)
        },
    }
}
