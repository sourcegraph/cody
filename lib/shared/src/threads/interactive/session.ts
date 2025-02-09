import { Observable } from 'observable-fns'

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
          type: 'read-files'
          files: string[]
          pending?: boolean
      }
    | {
          type: 'create-file'
          file: string
          content: string
          pending?: boolean
      }
    | {
          type: 'edit-file'
          file: string
          diff: string
          diffStat: {
              added: number
              changed: number
              deleted: number
          }
          pending?: boolean
      }
    | {
          type: 'terminal-command'
          cwd?: string
          command: string
          output?: string
          userChoice: 'pending' | 'run' | 'ignore'
      }
    | { type: 'definition'; symbol: string; pending?: boolean }
    | {
          type: 'references'
          symbol: string
          results?: string[]
          repositories?: string[]
          pending?: boolean
      }
)

export interface InteractiveThread {
    /**
     * A monotonically increasing integer that represents the version of this data. Each time the
     * rest of the data structure changes, this field is incremented.
     */
    v: number

    /** The thread ID. */
    id: ThreadID

    /**
     * The contents of the thread.
     */
    steps: ThreadStep[]
}

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
          type: 'terminal-command:user-choice'
          step: ThreadStepID
          choice: 'run' | 'ignore'
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

export function createInteractiveThreadService(threadStorage: ThreadStorage): InteractiveThreadService {
    const subscribers = new Map<ThreadID, Set<(thread: InteractiveThread) => void>>()

    return {
        observe(threadID: ThreadID, options: ObserveThreadOptions): Observable<InteractiveThread> {
            return new Observable<InteractiveThread>(subscriber => {
                let thread = threadStorage.get(threadID)
                if (options.create && !thread) {
                    throw new Error(`thread ${threadID} already exists`)
                }
                if ((options.create || options.getOrCreate) && !thread) {
                    thread = {
                        v: 0,
                        id: threadID,
                        steps: [],
                    }
                    threadStorage.store(thread)
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
            const prev = threadStorage.get(threadID)
            if (!prev) {
                throw new Error(`thread ${threadID} not found`)
            }

            const thread = JSON.parse(JSON.stringify(prev)) as InteractiveThread
            thread.v++

            switch (update.type) {
                case 'append-human-message':
                    thread.steps = [
                        ...thread.steps,
                        { id: newThreadStepID(), type: 'human-message', content: update.content },
                    ]
                    break
                case 'append-agent-steps':
                    thread.steps = [...thread.steps, ...update.steps]
                    break
                case 'terminal-command:user-choice':
                    {
                        const step = thread.steps.find(step => step.id === update.step)
                        if (!step) {
                            throw new Error(`step ${update.step} not found`)
                        }
                        if (step.type !== 'terminal-command') {
                            throw new Error(`step ${update.step} type is not terminal-command`)
                        }
                        if (step.userChoice !== 'pending') {
                            throw new Error(`step ${update.step} already has user choice`)
                        }
                        thread.steps = thread.steps.map(step => {
                            if (step.id === update.step) {
                                return {
                                    ...step,
                                    userChoice: update.choice,
                                }
                            }
                            return step
                        })
                    }
                    break
                case 'ping':
                    break
            }

            threadStorage.store(thread)
            for (const callback of subscribers.get(threadID) ?? []) {
                callback(thread)
            }
            return thread
        },
    }
}

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
