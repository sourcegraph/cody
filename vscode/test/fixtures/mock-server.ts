import { type Socket } from 'node:net'

import { PubSub } from '@google-cloud/pubsub'
import express from 'express'
import * as uuid from 'uuid'

import { type TelemetryEventInput } from '@sourcegraph/telemetry'

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

const topicPublisher = pubSubClient.topic('projects/sourcegraph-telligent-testing/topics/e2e-testing', publishOptions)

// Runs a stub Cody service for testing.
export async function run<T>(around: () => Promise<T>): Promise<T> {
    const app = express()
    app.use(express.json())

    // endpoint which will accept the data that you want to send in that you will add your pubsub code
    app.post('/.api/testLogging', (req, res) => {
        void logTestingData('legacy', req.body)
        storeLoggedEvents(req.body)
        res.status(200)
    })

    // matches @sourcegraph/cody-shared/src/sourcegraph-api/telemetry/MockServerTelemetryExporter
    // importing const doesn't work, so hardcode it here.
    app.post('/.api/mockEventRecording', (req, res) => {
        const events = req.body as TelemetryEventInput[]
        events.forEach(event => {
            void logTestingData('new', JSON.stringify(event))
            if (
                ![
                    'cody.extension', // extension setup events can behave differently in test environments
                ].includes(event.feature)
            ) {
                loggedV2Events.push(`${event.feature}/${event.action}`)
            }
        })
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
        const response =
            request.body.messages[lastHumanMessageIndex].text.includes(FIXUP_PROMPT_TAG) ||
            request.body.messages[lastHumanMessageIndex].text.includes(NON_STOP_FIXUP_PROMPT_TAG)
                ? responses.fixup
                : responses.chat
        res.send(`event: completion\ndata: {"completion": ${JSON.stringify(response)}}\n\nevent: done\ndata: {}\n\n`)
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
            throw new Error(`Last completion message did not contain code starting with ${OPENING_CODE_TAG}`)
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

    app.post('/.api/graphql', (req, res) => {
        if (req.headers.authorization !== `token ${VALID_TOKEN}`) {
            res.sendStatus(401)
            return
        }

        const operation = new URL(req.url, 'https://example.com').search.replace(/^\?/, '')
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
                res.send(JSON.stringify({ data: { isContextRequiredForChatQuery: false } }))
                break
            case 'SiteIdentification':
                res.send(
                    JSON.stringify({
                        data: {
                            site: {
                                siteID: 'test-site-id',
                                productSubscription: { license: { hashedKey: 'mmm,hashedkey' } },
                            },
                        },
                    })
                )
                break
            case 'SiteProductVersion':
                res.send(JSON.stringify({ data: { site: { productVersion: 'dev' } } }))
                break
            case 'SiteGraphQLFields':
                res.send(JSON.stringify({ data: { __type: { fields: [{ name: 'id' }, { name: 'isCodyEnabled' }] } } }))
                break
            case 'SiteHasCodyEnabled':
                res.send(JSON.stringify({ data: { site: { isCodyEnabled: true } } }))
                break
            case 'CurrentSiteCodyLlmConfiguration': {
                res.send(
                    JSON.stringify({
                        data: {
                            site: {
                                codyLLMConfiguration: { chatModel: 'test-chat-default-model', provider: 'sourcegraph' },
                            },
                        },
                    })
                )
                break
            }
            default:
                res.sendStatus(400)
                break
        }
    })

    const server = app.listen(SERVER_PORT)

    // Calling close() on the server only stops accepting new connections
    // and does not terminate existing connections. This can result in
    // tests reusing the previous tests server unless they are explicitly
    // closed, so track connections as they open.
    const sockets = new Set<Socket>()
    server.on('connection', socket => sockets.add(socket))

    const result = await around()

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

    const messageID = await topicPublisher.publishMessage({ data: dataBuffer }).catch(error => {
        console.error('Error publishing message:', error)
    })
    console.log(`Message published - Type: ${type}, ID: ${messageID}, TestRunId: ${currentTestRunID}`)
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
