import { Observable } from 'observable-fns'

export type TranscriptMessage =
    | { type: 'user'; content?: string }
    | { type: 'agent'; steps: TranscriptAction[] }

export type TranscriptAction =
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
    | {
          type: 'message'
          content: string
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
    transcript: TranscriptMessage[]
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
}

type ThreadUpdate =
    | {
          type: 'append-human-message'
          content: string
      }
    | { type: 'ping' }

export function createInteractiveThreadService(): InteractiveThreadService {
    const threads = new Map<string, InteractiveThread>()
    const subscribers = new Map<string, Set<(thread: InteractiveThread) => void>>()

    return {
        observe(threadID: string, options: ObserveThreadOptions): Observable<InteractiveThread> {
            return new Observable<InteractiveThread>(subscriber => {
                if (options.create) {
                    if (threads.has(threadID)) {
                        throw new Error(`thread ${threadID} already exists`)
                    }
                    threads.set(threadID, {
                        v: 0,
                        id: threadID,
                        transcript: [],
                    })
                }

                const thread = threads.get(threadID)
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
            const thread = threads.get(threadID)
            if (!thread) {
                throw new Error(`thread ${threadID} not found`)
            }

            const updatedThread: InteractiveThread = { ...thread, v: thread.v + 1 }

            switch (update.type) {
                case 'append-human-message':
                    updatedThread.transcript = [
                        ...updatedThread.transcript,
                        { type: 'user', content: update.content },
                    ]
                    break
                case 'ping':
                    break
            }

            threads.set(threadID, updatedThread)
            for (const callback of subscribers.get(threadID) ?? []) {
                callback(updatedThread)
            }
            return updatedThread
        },
    }
}
