import { type Observable, interval } from 'observable-fns'
import createClient, { type Middleware } from 'openapi-fetch'
import { fetch } from '../fetch'
import { promiseFactoryToObservable } from '../misc/observable'
import { type pendingOperation, switchMapReplayOperation } from '../misc/observableOperation'
import type { components, paths } from '../sourcegraph-api/openapi.generated'

type schemas = components['schemas']
type Thread = schemas['Thread']
type ThreadCreate = schemas['ThreadCreate']
type ThreadUpdate = schemas['ThreadUpdate']

export interface ThreadService {
    observeThreads(): Observable<Thread[] | typeof pendingOperation | Error>
    createThread(create: ThreadCreate): Promise<Thread>
    updateThread(id: Thread['id'], update: ThreadUpdate): Promise<Thread>
    deleteThread(id: Thread['id']): Promise<void>
    getThread(id: Thread['id']): Promise<Thread | undefined>
}

const detectResponseError: Middleware = {
    async onResponse({ response }) {
        if (!response.ok) {
            const body = await response.json().catch(err => null)
            if (body && isErrorMessage(body)) {
                throw new Error(
                    `Sourcegraph API responded with HTTP error ${response.status}: ${body.message} (type: ${body.type})`
                )
            }
            throw new Error(`Sourcegraph API responded with HTTP error ${response.status}`)
        }
        return response
    },
}

type ErrorMessage = {
    message: string
    type: string
}

function isErrorMessage(body: any): body is ErrorMessage {
    return typeof body !== 'object' || !body || ('message' in body && typeof body.message === 'string')
}

export function createThreadService(): ThreadService {
    // TODO!(sqS): baseUrl
    const client = createClient<paths>({
        fetch: fetch as any,
        baseUrl: 'https://sourcegraph.test:3443',
    })
    client.use(detectResponseError)

    return {
        observeThreads() {
            return interval(5000).pipe(
                switchMapReplayOperation(() =>
                    promiseFactoryToObservable(
                        async signal => (await client.GET('/.api/threads', { signal })).data!.threads
                    )
                )
            )
        },
        async createThread(create) {
            const resp = await client.POST('/.api/threads', { body: create })
            return resp.data!
        },
        async updateThread(id, update) {
            const resp = await client.PATCH('/.api/threads/{thread_id}', {
                params: { path: { thread_id: id.toString() } },
                body: update,
            })
            if (!resp.data) {
                throw new Error('Failed to update thread')
            }
            return resp.data
        },
        async deleteThread(id) {
            await client.DELETE('/.api/threads/{thread_id}', {
                params: { path: { thread_id: id.toString() } },
            })
        },
        async getThread(id) {
            const resp = await client.GET('/.api/threads/{thread_id}', {
                params: { path: { thread_id: id.toString() } },
            })
            return resp.data
        },
    }
}

export const threadService = createThreadService()
