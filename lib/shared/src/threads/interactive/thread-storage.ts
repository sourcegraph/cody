import truncate from 'lodash/truncate'
import { type Observable, Subject, map } from 'observable-fns'
import type * as vscode from 'vscode'
import { type URI, Utils } from 'vscode-uri'
import { isDefined } from '../../common'
import { abortableOperation, startWith } from '../../misc/observable'
import { type InteractiveThread, type ThreadID, isThreadID } from './thread'

export interface ThreadStorage {
    get(id: ThreadID): Promise<InteractiveThread | null>
    set(id: ThreadID, value: InteractiveThread): Promise<void>
    list(): Observable<ThreadEntry[]>
}

export interface ThreadEntry {
    id: ThreadID
    title: string | null
    created: number
}

export function createMementoThreadStorage(memento: vscode.Memento): ThreadStorage {
    const changes = new Subject<void>()

    function get(id: ThreadID): InteractiveThread | null {
        return memento.get(id) ?? null
    }

    async function set(id: ThreadID, value: InteractiveThread): Promise<void> {
        await memento.update(id, value)
    }

    function list(): Observable<ThreadEntry[]> {
        return changes.pipe(
            startWith(undefined),
            map(() =>
                memento
                    .keys()
                    .filter(key => isThreadID(key))
                    .map(id => get(id))
                    .filter(isDefined)
                    .filter(t => t.steps.length > 0)
                    .map(thread => ({
                        id: thread.id,
                        title: threadTitle(thread),
                        created: thread.created,
                    }))
            )
        )
    }

    return {
        get: id => Promise.resolve(get(id)),
        set,
        list,
    }
}

export function createFileSystemThreadStorage(
    fs: typeof vscode.workspace.fs,
    storageUri: URI
): ThreadStorage {
    const changes = new Subject<void>()

    const threadsDir = Utils.joinPath(storageUri, 'threads')

    function threadFilePath(id: ThreadID): URI {
        return Utils.joinPath(threadsDir, `${id}.json`)
    }

    async function get(id: ThreadID): Promise<InteractiveThread | null> {
        try {
            const content = await fs.readFile(threadFilePath(id))
            return JSON.parse(new TextDecoder().decode(content)) as InteractiveThread
        } catch (error) {
            if ((error as any).code === 'FileNotFound') {
                return null
            }
            throw error
        }
    }

    async function set(id: ThreadID, value: InteractiveThread): Promise<void> {
        const content = new TextEncoder().encode(JSON.stringify(value, null, 2))
        const uri = threadFilePath(id)
        await fs.createDirectory(Utils.joinPath(uri, '..'))
        await fs.writeFile(uri, content)
        changes.next()
    }

    function list(): Observable<ThreadEntry[]> {
        return changes.pipe(
            startWith(undefined),
            abortableOperation(async (_, signal) => {
                let files: Awaited<ReturnType<typeof fs.readDirectory>>
                try {
                    files = await fs.readDirectory(threadsDir)
                } catch (error) {
                    if ((error as any).code === 'FileNotFound') {
                        // The `storageUri` or `threadsDir` dirs might not exist, which means there
                        // are no threads.
                        return []
                    }
                    throw error
                }
                signal?.throwIfAborted()
                const threads = await Promise.all(
                    files.map(async ([name]) => {
                        if (!name.endsWith('.json')) {
                            return null
                        }
                        const id = name.replace(/\.json$/, '')
                        if (!isThreadID(id)) {
                            return null
                        }
                        const thread = await get(id)
                        return thread && thread.steps.length > 0
                            ? {
                                  id,
                                  title: threadTitle(thread),
                                  created: thread.created,
                              }
                            : null
                    })
                )
                signal?.throwIfAborted()
                return threads.filter(t => t !== null).toSorted((a, b) => b.created - a.created)
            })
        )
    }

    return {
        get,
        set,
        list,
    }
}

function threadTitle(thread: InteractiveThread): string | null {
    const firstHumanMessage = thread.steps.find(step => step.type === 'human-message')
    return firstHumanMessage?.type === 'human-message'
        ? truncate(firstHumanMessage.content, { length: 100 })
        : null
}
