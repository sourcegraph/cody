import { Subject } from 'observable-fns'
import type {
    AuthCredentials,
    ClientConfiguration,
    ExternalAuthCommand,
    ExternalAuthProvider,
} from '../configuration'
import { logError } from '../logger'
import { ExternalAuthProviderError } from '../sourcegraph-api/errors'
import type { ClientSecrets } from './resolver'

export const externalAuthRefresh = new Subject<void>()

export function normalizeServerEndpointURL(url: string): string {
    return url.endsWith('/') ? url : `${url}/`
}

async function executeCommand(cmd: ExternalAuthCommand): Promise<string> {
    if (typeof process === 'undefined' || !process.version) {
        throw new Error('Command execution is only supported in Node.js environments')
    }

    const { exec } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(exec)

    const command = cmd.commandLine.join(' ')

    // No need to check error code, promisify causes exec to throw in case of errors
    const { stdout } = await execAsync(command, {
        shell: cmd.shell,
        timeout: cmd.timeout,
        windowsHide: cmd.windowsHide,
        env: { ...process.env, ...cmd.environment },
    })

    return stdout.trim()
}

interface HeaderCredentialResult {
    headers: Record<string, string>
    expiration?: number | undefined
}

let _headersCache: Promise<HeaderCredentialResult> | undefined = undefined

function hasExpired(expiration: number | undefined): boolean {
    return expiration !== undefined && expiration * 1000 < Date.now()
}

async function getExternalProviderHeaders(
    externalProvider: ExternalAuthProvider
): Promise<HeaderCredentialResult> {
    const result = await executeCommand(externalProvider.executable).catch(error => {
        throw new Error(`Failed to execute external auth command: ${error.message || error}`)
    })

    const credentials = JSON.parse(result) as HeaderCredentialResult

    if (!credentials?.headers) {
        throw new Error(`Output of the external auth command is invalid: ${result}`)
    }

    if (hasExpired(credentials.expiration)) {
        throw new Error(
            'Credentials expiration cannot be set to a date in the past: ' +
                `${new Date(credentials.expiration! * 1000)} (${credentials.expiration})`
        )
    }

    return credentials
}

async function createTokenCredentials(
    clientSecrets: ClientSecrets,
    serverEndpoint: string
): Promise<AuthCredentials> {
    const token = await clientSecrets.getToken(serverEndpoint).catch(error => {
        throw new Error(
            `Failed to get access token for endpoint ${serverEndpoint}: ${error.message || error}`
        )
    })

    return {
        credentials: token
            ? { token, source: await clientSecrets.getTokenSource(serverEndpoint) }
            : undefined,
        serverEndpoint,
    }
}

function createHeaderCredentials(
    externalProvider: ExternalAuthProvider,
    serverEndpoint: string
): AuthCredentials {
    // Needed in case of account switch so we reset the cache.
    // We could also set it to undefined but there is no harm in pre-loading the cache.
    _headersCache = getExternalProviderHeaders(externalProvider)

    return {
        credentials: {
            async getHeaders() {
                try {
                    while (true) {
                        let observed = _headersCache
                        if (!observed || hasExpired((await observed)?.expiration)) {
                            if (observed !== _headersCache) {
                                continue // cache already changed, retry
                            }
                            observed = _headersCache = getExternalProviderHeaders(externalProvider)
                        }
                        return (await observed).headers
                    }
                } catch (error) {
                    _headersCache = undefined
                    externalAuthRefresh.next()

                    logError('resolveAuth', `External Auth Provider Error: ${error}`)
                    throw new ExternalAuthProviderError(
                        error instanceof Error ? error.message : String(error)
                    )
                }
            },
        },
        serverEndpoint,
    }
}

export async function resolveAuth(
    endpoint: string,
    configuration: Pick<
        ClientConfiguration,
        'authExternalProviders' | 'overrideServerEndpoint' | 'overrideAuthToken'
    >,
    clientSecrets: ClientSecrets
): Promise<AuthCredentials> {
    const { authExternalProviders, overrideServerEndpoint, overrideAuthToken } = configuration
    const serverEndpoint = normalizeServerEndpointURL(overrideServerEndpoint || endpoint)

    try {
        if (overrideAuthToken) {
            return { credentials: { token: overrideAuthToken }, serverEndpoint }
        }

        const externalProvider = authExternalProviders.find(
            provider => normalizeServerEndpointURL(provider.endpoint) === serverEndpoint
        )

        return externalProvider
            ? createHeaderCredentials(externalProvider, serverEndpoint)
            : createTokenCredentials(clientSecrets, serverEndpoint)
    } catch (error) {
        return {
            credentials: undefined,
            serverEndpoint,
            error,
        }
    }
}
