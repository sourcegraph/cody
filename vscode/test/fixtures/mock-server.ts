import type { Socket } from 'node:net'

import { PubSub } from '@google-cloud/pubsub'
import express from 'express'
import * as uuid from 'uuid'

import type { TelemetryEventInput } from '@sourcegraph/telemetry'

// create interface for the request
interface MockRequest {
    headers: {
        authorization: string
    }
    body: {
        messages: {
            text: string
        }[]
    }
}

const SERVER_PORT = 49300

export const SERVER_URL = 'http://localhost:49300'
export const VALID_TOKEN = 'sgp_1234567890123456789012345678901234567890'

const responses = {
    chat: 'hello from the assistant',
    chatWithSnippet: [
        'Hello! Here is a code snippet:',
        '',
        '```',
        'def fib(n):',
        '  if n < 0:',
        '    return n',
        '  else:',
        '    return fib(n-1) + fib(n-2)',
        '```',
        '',
        'Hope this helps!',
    ].join('\n'),
    fixup: '<CODE5711><title>Goodbye Cody</title></CODE5711>',
    code: {
        template: { completion: '', stopReason: 'stop_sequence' },
        mockResponses: ['myFirstCompletion', 'myNotFirstCompletion'],
    },
}

const FIXUP_PROMPT_TAG = '<SELECTEDCODE7662>'
const NON_STOP_FIXUP_PROMPT_TAG = '<CODE5711>'

const pubSubClient = new PubSub({
    projectId: 'sourcegraph-telligent-testing',
})

const publishOptions = {
    gaxOpts: {
        timeout: 120000,
    },
}

const topicPublisher = pubSubClient.topic(
    'projects/sourcegraph-telligent-testing/topics/e2e-testing',
    publishOptions
)

//#region GraphQL Mocks

// This is a primitive system for injecting GraphQL responses per-test, instead
// of adding every possible GraphQL response to the mock server directly.

type GraphQlMockResponse =
    | {
          kind: 'json'
          json: string
      }
    | {
          kind: 'status'
          status: number
          message: string | undefined
      }

class GraphQlMock {
    private response: GraphQlMockResponse = {
        kind: 'status',
        status: 400,
        message: 'unhandled GraphQL operation',
    }
    private nextMock: GraphQlMock | undefined = undefined

    constructor(
        private readonly container: MockServer,
        private readonly operation: string
    ) {}

    public replyJson(json: any): GraphQlMock {
        this.response = {
            kind: 'json',
            json: JSON.stringify(json),
        }
        return this
    }

    public replyStatus(code: number, message?: string): GraphQlMock {
        this.response = {
            kind: 'status',
            status: code,
            message,
        }
        return this
    }

    public next(): GraphQlMock {
        this.nextMock = new GraphQlMock(this.container, this.operation)
        return this.nextMock
    }

    handleRequest(res: express.Response): void {
        switch (this.response.kind) {
            case 'json':
                res.send(this.response.json)
                break
            case 'status':
                res.status(this.response.status)
                if (this.response.message) {
                    res.statusMessage = this.response.message
                }
                break
        }
        if (this.nextMock) {
            this.container.graphQlMocks.set(this.operation, this.nextMock)
        }
    }
}

//#endregion

// Lets the test change the behavior of the mock server.
export class MockServer {
    graphQlMocks: Map<string, GraphQlMock> = new Map()

    constructor(public readonly express: express.Express) {}

    public onGraphQl(operation: string): GraphQlMock {
        let mock = this.graphQlMocks.get(operation)
        if (!mock) {
            mock = new GraphQlMock(this, operation)
            this.graphQlMocks.set(operation, mock)
        }
        return mock
    }

    // Runs a stub Cody service for testing.
    public static async run<T>(around: (server: MockServer) => Promise<T>): Promise<T> {
        const app = express()
        const controller = new MockServer(app)

        app.use(express.json())

        // endpoint which will accept the data that you want to send in that you will add your pubsub code
        app.post('/.api/testLogging', (req, res) => {
            void logTestingData('legacy', req.body)
            storeLoggedEvents(req.body)
            res.status(200)
        })

        // matches @sourcegraph/cody-shared't work, so hardcode it here.
        app.post('/.api/mockEventRecording', (req, res) => {
            const events = req.body as TelemetryEventInput[]
            for (const event of events) {
                void logTestingData('new', JSON.stringify(event))
                if (
                    ![
                        'cody.extension', // extension setup events can behave differently in test environments
                    ].includes(event.feature)
                ) {
                    loggedV2Events.push(`${event.feature}/${event.action}`)
                }
            }
            res.status(200)
        })

        /** Whether to simulate that rate limits have been hit */
        let chatRateLimited = false
        /** Whether the user is Pro (true), Free (false) or not a dotCom user (undefined) */
        let chatRateLimitPro: boolean | undefined
        app.post('/.api/completions/stream', (req, res) => {
            if (chatRateLimited) {
                res.setHeader('retry-after', new Date().toString())
                res.setHeader('x-ratelimit-limit', '12345')
                if (chatRateLimitPro !== undefined) {
                    res.setHeader('x-is-cody-pro-user', `${chatRateLimitPro}`)
                }
                res.sendStatus(429)
                return
            }

            // TODO: Filter streaming response
            // TODO: Handle multiple messages
            // Ideas from Dom - see if we could put something in the test request itself where we tell it what to respond with
            // or have a method on the server to send a set response the next time it sees a trigger word in the request.
            const request = req as MockRequest
            const lastHumanMessageIndex = request.body.messages.length - 2
            let response = responses.chat
            if (
                request.body.messages[lastHumanMessageIndex].text.includes(FIXUP_PROMPT_TAG) ||
                request.body.messages[lastHumanMessageIndex].text.includes(NON_STOP_FIXUP_PROMPT_TAG)
            ) {
                response = responses.fixup
            }
            if (request.body.messages[lastHumanMessageIndex].text.includes('show me a code snippet')) {
                response = responses.chatWithSnippet
            }
            // Delay by 400ms to allow the client to perform a small action before receiving the response.
            // e.g. clicking on a file or move the cursor around.
            if (request.body.messages[lastHumanMessageIndex].text.startsWith('delay')) {
                const r1 = responses.chatWithSnippet
                const r2 = r1 + '\n\nDone'
                res.write(`event: completion\ndata: {"completion": ${JSON.stringify(r1)}}\n\n`)
                setTimeout(() => {
                    res.write(`event: completion\ndata: {"completion": ${JSON.stringify(r2)}}\n\n`)
                    res.write('event: done\ndata: {}\n\n')
                    res.end() // End the response after sending the events
                }, 400)
                return
            }
            res.send(
                `event: completion\ndata: {"completion": ${JSON.stringify(
                    response
                )}}\n\nevent: done\ndata: {}\n\n`
            )
        })
        app.post('/.test/completions/triggerRateLimit', (req, res) => {
            chatRateLimited = true
            chatRateLimitPro = undefined
            res.sendStatus(200)
        })
        app.post('/.test/completions/triggerRateLimit/free', (req, res) => {
            chatRateLimited = true
            chatRateLimitPro = false
            res.sendStatus(200)
        })
        app.post('/.test/completions/triggerRateLimit/pro', (req, res) => {
            chatRateLimited = true
            chatRateLimitPro = true
            res.sendStatus(200)
        })
        app.post('/.test/completions/triggerRateLimit/enterprise', (req, res) => {
            chatRateLimited = true
            chatRateLimitPro = undefined
            res.sendStatus(200)
        })

        app.post('/.api/completions/code', (req, res) => {
            const OPENING_CODE_TAG = '<CODE5711>'
            const request = req as MockRequest

            // Extract the code from the last message.
            let completionPrefix = request.body.messages.at(-1)?.text
            if (!completionPrefix?.startsWith(OPENING_CODE_TAG)) {
                throw new Error(
                    `Last completion message did not contain code starting with ${OPENING_CODE_TAG}`
                )
            }
            completionPrefix = completionPrefix.slice(OPENING_CODE_TAG.length)

            // Trim to the last word since our mock responses are just completing words. If the
            // request has a trailing space, we won't provide anything since the user hasn't
            // started typing a word.
            completionPrefix = completionPrefix?.split(/\s/g).at(-1)

            // Find a matching mock response that is longer than what we've already
            // typed.
            const completion =
                responses.code.mockResponses
                    .find(
                        candidate =>
                            completionPrefix?.length &&
                            candidate.startsWith(completionPrefix) &&
                            candidate.length > completionPrefix.length
                    )
                    ?.slice(completionPrefix?.length) ?? ''

            const response = { ...responses.code.template, completion }
            res.send(JSON.stringify(response))
        })

        let attribution = false
        app.post('/.api/graphql', (req, res) => {
            if (req.headers.authorization !== `token ${VALID_TOKEN}`) {
                res.sendStatus(401)
                return
            }

            const operation = new URL(req.url, 'https://example.com').search.replace(/^\?/, '')
            if (controller.graphQlMocks.has(operation)) {
                try {
                    controller.onGraphQl(operation).handleRequest(res)
                } catch (error) {
                    res.sendStatus(500)
                    res.statusMessage = (error as Error).message
                }
            } else {
                switch (operation) {
                    case 'CurrentUser':
                        res.send(
                            JSON.stringify({
                                data: {
                                    currentUser: {
                                        id: 'u',
                                        hasVerifiedEmail: true,
                                        displayName: 'Person',
                                        username: 'person',
                                        avatarURL: '',
                                        primaryEmail: {
                                            email: 'person@company.comp',
                                        },
                                    },
                                },
                            })
                        )
                        break
                    case 'CurrentUserCodyProEnabled':
                        res.send(
                            JSON.stringify({
                                data: {
                                    currentUser: {
                                        codyProEnabled: false,
                                    },
                                },
                            })
                        )
                        break
                    case 'IsContextRequiredForChatQuery':
                        res.send(
                            JSON.stringify({
                                data: { isContextRequiredForChatQuery: false },
                            })
                        )
                        break
                    case 'SiteIdentification':
                        res.send(
                            JSON.stringify({
                                data: {
                                    site: {
                                        siteID: 'test-site-id',
                                        productSubscription: {
                                            license: { hashedKey: 'mmm,hashedkey' },
                                        },
                                    },
                                },
                            })
                        )
                        break
                    case 'SiteProductVersion':
                        res.send(
                            JSON.stringify({
                                data: { site: { productVersion: 'dev' } },
                            })
                        )
                        break
                    case 'SiteGraphQLFields':
                        res.send(
                            JSON.stringify({
                                data: {
                                    __type: {
                                        fields: [{ name: 'id' }, { name: 'isCodyEnabled' }],
                                    },
                                },
                            })
                        )
                        break
                    case 'SiteHasCodyEnabled':
                        res.send(JSON.stringify({ data: { site: { isCodyEnabled: true } } }))
                        break
                    case 'CurrentSiteCodyLlmConfiguration': {
                        res.send(
                            JSON.stringify({
                                data: {
                                    site: {
                                        codyLLMConfiguration: {
                                            chatModel: 'test-chat-default-model',
                                            provider: 'sourcegraph',
                                        },
                                    },
                                },
                            })
                        )
                        break
                    }
                    case 'CodyConfigFeaturesResponse': {
                        res.send(
                            JSON.stringify({
                                data: {
                                    site: {
                                        codyConfigFeatures: {
                                            chat: true,
                                            autoComplete: true,
                                            commands: true,
                                            attribution,
                                        },
                                    },
                                },
                            })
                        )
                        break
                    }
                    default:
                        res.sendStatus(400)
                        res.statusMessage = `unhandled GraphQL operation ${operation}`
                        break
                }
            }
        })

        app.post('/.test/attribution/enable', (req, res) => {
            attribution = true
            res.sendStatus(200)
        })
        app.post('/.test/attribution/disable', (req, res) => {
            attribution = false
            res.sendStatus(200)
        })

        const server = app.listen(SERVER_PORT)

        // Calling close() on the server only stops accepting new connections
        // and does not terminate existing connections. This can result in
        // tests reusing the previous tests server unless they are explicitly
        // closed, so track connections as they open.
        const sockets = new Set<Socket>()
        server.on('connection', socket => sockets.add(socket))

        const result = await around(controller)

        // Tell the server to stop accepting connections. The server won't shut down
        // and the callback won't be fired until all existing clients are closed.
        const serverClosed = new Promise(resolve => server.close(resolve))

        // Close all the existing connections and wait for the server shutdown.
        for (const socket of sockets) {
            socket.destroy()
        }
        await serverClosed

        return result
    }
}

const loggedTestRun: Record<string, boolean> = {}

async function logTestingData(type: 'legacy' | 'new', data: string): Promise<void> {
    if (process.env.CI === undefined) {
        return
    }

    const message = {
        type,
        event: data,
        timestamp: new Date().getTime(),
        test_name: currentTestName,
        test_id: currentTestID,
        test_run_id: currentTestRunID,
        UID: uuid.v4(),
    }

    // Publishes the message as a string
    const dataBuffer = Buffer.from(JSON.stringify(message))

    await topicPublisher.publishMessage({ data: dataBuffer }).catch(error => {
        console.error('Error publishing message:', error)
    })
    if (!loggedTestRun[currentTestRunID]) {
        console.log(
            `Messages published - TestRunId: ${currentTestRunID}, TestName: ${currentTestName}, TestID: ${currentTestID}`
        )
        loggedTestRun[currentTestRunID] = true
    }
}

let currentTestName: string
let currentTestID: string
let currentTestRunID: string

export function sendTestInfo(testName: string, testID: string, testRunID: string): void {
    currentTestName = testName || ''
    currentTestID = testID || ''
    currentTestRunID = testRunID || ''
}

export let loggedEvents: string[] = []

// Events recorded using the new event recorders
// Needs to be recorded separately from the legacy events to ensure ordering
// is stable.
let loggedV2Events: string[] = []

export function resetLoggedEvents(): void {
    loggedEvents = []
    loggedV2Events = []
}
function storeLoggedEvents(event: string): void {
    interface ParsedEvent {
        event: string
    }
    const parsedEvent = JSON.parse(JSON.stringify(event)) as ParsedEvent
    const name = parsedEvent.event
    loggedEvents.push(name)
}
