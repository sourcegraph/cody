import { type Observable, interval } from 'observable-fns'
import createClient, { type Middleware } from 'openapi-fetch'
import {
    addAuthHeaders,
    addCodyClientIdentificationHeaders,
    addTraceparent,
    currentResolvedConfig,
} from '..'
import type { SerializedChatTranscript } from '../chat/transcript'
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
    getThread(id: Thread['id']): Promise<Thread | null>

    toTranscript(thread: Pick<Thread, 'data'>): SerializedChatTranscript
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
    const client = createClient<paths>({
        baseUrl: 'https://sourcegraph.test:3443', // TODO!(sqs)
    })
    client.use(detectResponseError)

    async function getFetchHeaders(): Promise<HeadersInit> {
        // TODO!(sqs)
        const config = await currentResolvedConfig()
        const headers = new Headers()
        await addAuthHeaders(config.auth, headers, new URL(config.auth.serverEndpoint))
        addTraceparent(headers)
        addCodyClientIdentificationHeaders(headers)
        return headers
    }

    return {
        observeThreads() {
            return interval(5000).pipe(
                switchMapReplayOperation(() =>
                    promiseFactoryToObservable(
                        async signal =>
                            (
                                await client.GET('/.api/threads', {
                                    signal,
                                    headers: await getFetchHeaders(),
                                })
                            ).data!.threads
                    )
                )
            )
        },
        async createThread(create) {
            const resp = await client.POST('/.api/threads', {
                body: create,
                headers: await getFetchHeaders(),
            })
            return resp.data!
        },
        async updateThread(id, update) {
            const resp = await client.PATCH('/.api/threads/{thread_id}', {
                params: { path: { thread_id: id.toString() } },
                body: update,
                headers: await getFetchHeaders(),
            })
            if (!resp.data) {
                throw new Error('Failed to update thread')
            }
            return resp.data
        },
        async deleteThread(id) {
            await client.DELETE('/.api/threads/{thread_id}', {
                params: { path: { thread_id: id.toString() } },
                headers: await getFetchHeaders(),
            })
        },
        async getThread(id) {
            const resp = await client.GET('/.api/threads/{thread_id}', {
                params: { path: { thread_id: id.toString() } },
                headers: await getFetchHeaders(),
            })
            return resp.data ?? null
        },
        toTranscript(thread) {
            if (!thread.data) {
                return { interactions: [] }
            }
            return JSON.parse(atob(thread.data as string /* TODO!(sqs) */))
        },
    }
}

export const threadService = createThreadService()
