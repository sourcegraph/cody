import https from 'node:https'
import { registerLocalCertificates } from '../certs'


interface LocalSGInstanceParams {
    serverEndpoint: string
    accessToken: string
}

interface LocalInstanceFailure {
    reason: string
    fix: string
}

class LocalInstanceError extends Error {
    constructor(failure: LocalInstanceFailure) {
        super(failure.reason + '\n💡 FIX: ' + failure.fix)
        this.name = 'LocalInstanceError'
    }
}

export class LocalSGInstance {
    private params: LocalSGInstanceParams

    constructor(private readonly endpoint: string = 'https://sourcegraph.test:3443') {
        const accessToken = process.env.LOCAL_SG_ACCESS_TOKEN ?? ''
        this.params = { serverEndpoint: this.endpoint, accessToken: accessToken }

        // There's no point in recording responses when running the whole stack locally.
        // - Roundtrip time is negligeable locally.
        // - Less complexity, you don't "doubt" the results you're seeing because you're
        //   unsure if something is recorded or not.
        process.env.CODY_RECORDING_MODE = 'passthrough'

        // Need to do this, otherwise we fail to check if the local instance is up.
        registerLocalCertificates()
    }

    // Returns a GraphQL client to interact with the API.
    public apiClient() {
    }

    public async beforeAll() {
        // Pretty rare case, but cheap to cover, so let's handle it anyway.
        if (this.params.serverEndpoint == '') {
            throw new LocalInstanceError({
                reason: "Sourcegraph Local instance endpoint cannot be blank",
                fix: "Make sure the endpoint passed to `new LocalSGInstance(arg)` is not an empty string, or simply use the default value"
            })
        }
        // Same.
        if (this.params.accessToken == '') {
            throw new LocalInstanceError({
                reason: "Sourcegraph Local instance access token cannot be blank",
                fix: "TODO"
            })
        }
        // Someone might think it's ok to use this against a live instance, which is not what this is made for.
        if (!this.params.accessToken.startsWith('sgp_local_')) {
            throw new LocalInstanceError({
                reason: "Sourcegraph Local instance access token isn't a local access token, i.e. not starting with sgp_local.",
                fix: "TODO"
            })
        }
        // Avoid residual environment variables messing up with flow.
        if (process.env.CODY_RECORDING_MODE != "passthrough") {
            throw new LocalInstanceError({
                reason: "Local E2E tests should never record response",
                fix: "TODO"
            })
        }

        let res = await this.checkInstanceIsOnline()
        if (res !== undefined) {
            throw new LocalInstanceError(res)
        }
    }

    public getParams(): LocalSGInstanceParams {
        return this.params
    }

    public checkInstanceIsOnline(): Promise<LocalInstanceFailure | undefined> {
        return new Promise((resolve, _) => {
            https.get(
                this.params.serverEndpoint,
                { timeout: 2000 }, // ms
                (res) => {
                    switch (res.statusCode) {
                        // Dotcom redirects to the marketing pages on /, so if we don't see that, we're not running in dotcom mode.
                        case 200:
                            resolve({
                                reason: "Sourcegraph instance is not running in Dotcom mode",
                                fix: "Kill the currently running instance and start it again using `sg start dotcom` instead."
                            })
                            break
                        // This is what we want.
                        case 307:
                            resolve(undefined)
                            break
                        default:
                            resolve({
                                reason: `Sourcegraph instance answered with a status code of ${res.statusCode}`,
                                fix: 'Inspect the logs, they most probably contain a line about it.'
                            })
                            break
                    }
                }
            ).on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'ECONNREFUSED') {
                    resolve({
                        reason: 'Sourcegraph instance is *not* running at all',
                        fix: 'In your Sourcegraph folder, run `sg start dotcom` and run the tests again'
                    })
                } else {
                    resolve({
                        reason: `Failed to connect to Sourcegraph instance: ${err.message}`,
                        fix: 'Something went wrong, if you have a running `sg start dotcom`, you could try to restart it'
                    })
                }
            })
        })
    }
}

