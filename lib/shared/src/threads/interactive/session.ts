import { Observable } from 'observable-fns'

export type ThreadStep =
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
          pendingUserApproval?: boolean
      }
    | { type: 'definition'; symbol: string; pending?: boolean }
    | {
          type: 'references'
          symbol: string
          results?: string[]
          repositories?: string[]
          pending?: boolean
      }

export interface InteractiveThread {
    /**
     * A monotonically increasing integer that represents the version of this data. Each time the
     * rest of the data structure changes, this field is incremented.
     */
    v: number

    /** The thread ID. */
    id: string

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
    observe(threadID: string, options: ObserveThreadOptions): Observable<InteractiveThread>

    /**
     * Perform an update action on the thread.
     *
     * It returns the updated thread. Callers should use the returned thread instead of the one
     * emitted by {@link InteractiveThreadService.observe}'s observable until the observable emits a
     * newer version.
     */
    update(threadID: string, update: ThreadUpdate): Promise<InteractiveThread>
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

type ThreadUpdate =
    | {
          type: 'append-human-message'
          content: string
      }
    | { type: 'ping' }

interface ThreadStorage {
    get(threadID: InteractiveThread['id']): InteractiveThread | null
    store(thread: InteractiveThread): void
}

export function mapThreadStorage(): ThreadStorage {
    const storage = new Map<string, InteractiveThread>()
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
            if (thread.steps.length > 0) {
                storage.setItem(`thread:${thread.id}`, JSON.stringify(thread))
            }
        },
    }
}

export function createInteractiveThreadService(threadStorage: ThreadStorage): InteractiveThreadService {
    const subscribers = new Map<string, Set<(thread: InteractiveThread) => void>>()

    return {
        observe(threadID: string, options: ObserveThreadOptions): Observable<InteractiveThread> {
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

        async update(threadID: string, update: ThreadUpdate): Promise<InteractiveThread> {
            const thread = threadStorage.get(threadID)
            if (!thread) {
                throw new Error(`thread ${threadID} not found`)
            }

            const updatedThread: InteractiveThread = { ...thread, v: thread.v + 1 }

            switch (update.type) {
                case 'append-human-message':
                    updatedThread.steps = [
                        ...updatedThread.steps,
                        { type: 'human-message', content: update.content },
                    ]
                    break
                case 'ping':
                    break
            }

            threadStorage.store(updatedThread)
            for (const callback of subscribers.get(threadID) ?? []) {
                callback(updatedThread)
            }
            return updatedThread
        },
    }
}

export function newThreadID(): string {
    return crypto.randomUUID()
}
