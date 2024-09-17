import https from 'node:https'
import json5 from 'json5'

import { SourcegraphGraphQLAPIClient, isError } from '@sourcegraph/cody-shared'
import type { TestingCredentials } from '../../../vscode/src/testutils/testing-credentials'
import { registerLocalCertificates } from '../certs'

// We don't want to run those tests anywhere else than locally.
export const isLocal = process.env.RUN_LOCAL_E2E_TESTS === 'true'

// Endpoint as defined by `sg setup` and `sg start dotcom-cody-e2e`
const defaultEndpoint = 'https://sourcegraph.test:3443'

// Access token set by `sg db default-site-admin`, always the same.
const defaultAccessToken = 'sgp_local_f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0'

// Cody GW endpoint we're checking for when we inspect the site config.
const expectedCodyGatewayEndpoint = 'http://localhost:9992'

interface LocalSGInstanceParams {
    serverEndpoint: string
    accessToken: string
}

interface LocalInstanceFailure {
    reason: string
    fix: string
}

// Prettier errors meant to be thrown by the LocalSGInstance, including
// additional context to help the user to understand how to fix the problem.
class LocalInstanceError extends Error {
    constructor(failure: LocalInstanceFailure) {
        super(failure.reason + '\n💡 FIX: ' + failure.fix)
        this.name = 'LocalInstanceError'
    }
}

// We need to access the "raw" site config, so we can grab fields that are not
// exposed in vanilla LLMSiteConfig queries, such as 'endpoint' or 'provider' for example.
interface JSONCLLMSiteConfig {
    site: {
        configuration: {
            effectiveContents: string
        }
    }
}

// Interface for asserting configuration extracted from reading the raw
// site config. These fields are not exposed by the vanilla LLMSiteConfig GraphQL
// queries.
interface LLMSiteConfig {
    'cody.enabled': boolean
    completions: {
        provider: string
        endpoint: string
    }
}

// TODO PR Comment
interface APIResponse<T> {
    data?: T
    errors?: { message: string; path?: string[] }[]
}

/**
 * LocalSGInstance ensures that the Local Sourcegraph Instance we're connecting to is configured to allow using it
 * as a target for writing local end-to-end tests. It performs a serie of checks to mitigate the trouble of understanding
 * common sources of errors, which when observed through the perspective of a test runner can be very time consuming
 * to understand to the unfamilar contributor.
 *
 * See agent/src/local-e2e/README.md for more informations.
 */
export class LocalSGInstance {
    private params: LocalSGInstanceParams
    private gqlclient: SourcegraphGraphQLAPIClient

    constructor(
        private readonly endpoint: string = defaultEndpoint,
        private readonly accessToken: string = defaultAccessToken
    ) {
        this.params = { serverEndpoint: this.endpoint, accessToken: this.accessToken }

        // There's no point in recording responses when running the whole stack locally.
        // - Roundtrip time is negligeable locally.
        // - Less complexity, you don't "doubt" the results you're seeing because you're
        //   unsure if something is recorded or not.
        process.env.CODY_RECORDING_MODE = 'passthrough'

        // Need to do this, otherwise we fail to check if the local instance is up.
        registerLocalCertificates()

        const headers: Record<string, string> = {}

        // We'll need our own client to request the site-config (as a site-admin)
        // for checking the LLM configuration section.
        this.gqlclient = SourcegraphGraphQLAPIClient.withStaticConfig({
            configuration: { customHeaders: headers, telemetryLevel: 'agent' },
            auth: {
                accessToken: this.params.accessToken,
                serverEndpoint: this.params.serverEndpoint,
            },
            clientState: { anonymousUserID: null },
        })
    }

    /**
     * beforeAll() is the entrypoint that performs all the checks and will throw
     * LocalInstanceErrors if it diagnose something wrong.
     */
    public async beforeAll() {
        // Pretty rare case, but cheap to cover, so let's handle it anyway.
        if (this.params.serverEndpoint === '') {
            throw new LocalInstanceError({
                reason: 'Sourcegraph Local instance endpoint cannot be blank',
                fix: 'Make sure the endpoint passed to `new LocalSGInstance(arg)` is not an empty string, or simply use the default value',
            })
        }
        // Same.
        if (this.params.accessToken === '') {
            throw new LocalInstanceError({
                reason: 'Sourcegraph Local instance access token cannot be blank',
                fix: 'Ensure a token is passed to `new LocalSGInstance(arg)` or use the default value',
            })
        }
        // Someone might think it's ok to use this against a live instance, which is not what this is made for.
        if (!this.params.accessToken.startsWith('sgp_local_')) {
            throw new LocalInstanceError({
                reason: "Sourcegraph Local instance access token isn't a local access token, i.e. not starting with sgp_local.",
                fix: 'Ensure the token passed to `new LocalSGInstance(arg)` is a local access token',
            })
        }
        // Avoid residual environment variables messing up with flow.
        if (process.env.CODY_RECORDING_MODE !== 'passthrough') {
            throw new LocalInstanceError({
                reason: 'Local E2E tests should never record response',
                fix: 'Check package.json, the task should never have CODY_RECORDING_MODE set to anything other than "passthrough"',
            })
        }

        let res = await this.checkInstanceIsOnline()
        if (res !== undefined) {
            throw new LocalInstanceError(res)
        }
        res = await this.checkLLMSiteConfig()
        if (res !== undefined) {
            throw new LocalInstanceError(res)
        }
    }

    /**
     * Pass these to the TestClient instance beforeAll method.
     */
    public getParams(): LocalSGInstanceParams {
        return this.params
    }

    /**
     * Pass these to the TestClient.create function.
     */
    public getCredentials(): TestingCredentials {
        return {
            token: this.params.accessToken,
            serverEndpoint: this.params.serverEndpoint,
            // TestClient expects a redacted token if we don't use it at all.
            // Normally, it's hash of the access token, but it might be hard to spot if
            // it were to be accidentally recorded, so we give a clearer placeholder instead.
            redactedToken: 'REDACTED_local_instance',
        }
    }

    // Ensure the instance is online through a simple HTTPs request, looking for various issues such as
    // running the wrong instance type, local instance isn't up, etc...
    private checkInstanceIsOnline(): Promise<LocalInstanceFailure | undefined> {
        return new Promise((resolve, _) => {
            https
                .get(
                    this.params.serverEndpoint,
                    { timeout: 2000 }, // ms
                    res => {
                        switch (res.statusCode) {
                            // Dotcom redirects to the marketing pages on /, so if we don't see that, we're not running in dotcom mode.
                            case 200:
                                resolve({
                                    reason: 'Sourcegraph instance is not running in Dotcom mode',
                                    fix: 'Kill the currently running instance and start it again using `sg start dotcom-cody-e2e` instead.',
                                })
                                break
                            // This is what we want.
                            case 307:
                                resolve(undefined)
                                break
                            case 502:
                                resolve({
                                    reason: 'Sourcegraph instance answered with a status code 502.',
                                    fix: 'Most likely, the instance is still booting up. Wait until you the see the "Sourcegraph is Ready" banner and try again.',
                                })
                                break
                            default:
                                resolve({
                                    reason: `Sourcegraph instance answered with a status code of ${res.statusCode} `,
                                    fix: 'Inspect the logs, they most probably contain a line about it.',
                                })
                                break
                        }
                    }
                )
                .on('error', (err: NodeJS.ErrnoException) => {
                    if (err.code === 'ECONNREFUSED') {
                        resolve({
                            reason: 'Sourcegraph instance is *not* running at all',
                            fix: 'In your Sourcegraph folder, run `sg start dotcom-cody-e2e` and run the tests again',
                        })
                    } else {
                        resolve({
                            reason: `Failed to connect to Sourcegraph instance: ${err.message} `,
                            fix: 'Something went wrong, if you have a running `sg start dotcom-cody-e2e`, you could try to restart it',
                        })
                    }
                })
        })
    }

    // Ensure the instance is properly configured, in particular it checks that we're using the locally
    // running cody gateway. The default site-config points the user at the dev MSP instance, so it's
    // easy to end up being confused about which one is running.
    private checkLLMSiteConfig(): Promise<LocalInstanceFailure | undefined> {
        const q = `query {
            site {
                configuration {
                    effectiveContents
                }
            }
        }`

        const siteConfigFix = `Edit ~/.sourcegraph/.site-config.json so the 'completions' object has at least the following settings:

    // ...
    "completions": {
        "endpoint": "http://localhost:9992",
        "chatModel": "anthropic/claude-2",
        "completionModel": "anthropic/claude-instant-1",
    }
    // ...

👉 The local instance will reload the configuration automatically, so you just need to save for the changes to take effects.`

        return new Promise((resolve, _) => {
            this.gqlclient
                .fetchSourcegraphAPI<APIResponse<JSONCLLMSiteConfig>>(q)
                .then(resp => {
                    if (isError(resp)) {
                        if (resp.message.includes('401')) {
                            resolve({
                                reason: `Sourcegraph instance rejected our access token: ${resp.message}`,
                                fix: 'In your sourcegraph folder, run `sg db default-site-admin`.',
                            })
                            return
                        }
                        resolve({
                            reason: `Failed to connect to Sourcegraph instance: ${resp.message} `,
                            fix: 'Something went wrong, if you have a running `sg start dotcom-cody-e2e`, you could try to restart it',
                        })
                        return
                    }
                    const raw = resp.data?.site.configuration.effectiveContents
                    if (raw === undefined) {
                        resolve({
                            reason: 'Sourcegraph site-config is somehow empty.',
                            fix: 'Check the logs on the local instance side.',
                        })
                        return
                    }

                    const content: LLMSiteConfig = json5.parse(raw)
                    if (!content['cody.enabled']) {
                        resolve({
                            reason: "Sourcegraph Local instance doesn't have Cody enabled",
                            fix: siteConfigFix,
                        })
                        return
                    }
                    if (content.completions.provider !== 'sourcegraph') {
                        resolve({
                            reason: "Sourcegraph Local instance Cody provider isn't set to 'sourcegraph'.",
                            fix: siteConfigFix,
                        })
                        return
                    }
                    if (content.completions.endpoint !== expectedCodyGatewayEndpoint) {
                        resolve({
                            reason: `Sourcegraph Local instance completion endpoint isn't set to the locally running Cody gateway (got '${content.completions.endpoint}' instead).`,
                            fix: siteConfigFix,
                        })
                        return
                    }
                    resolve(undefined)
                })
                .catch(e => {
                    resolve({
                        reason: `Unexpected error: ${JSON.stringify(e)}`,
                        fix: 'Examine the error.',
                    })
                })
        })
    }
}
