import type {
    AuthCredentials,
    ClientConfiguration,
    ExternalAuthCommand,
    ExternalAuthProvider,
    HeaderCredential,
} from '../configuration'
import { logError } from '../logger'
import { type ClientSecrets, refreshConfig } from './resolver'

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

async function getExternalProviderHeaders(
    serverEndpoint: string,
    authExternalProviders: readonly ExternalAuthProvider[]
): Promise<HeaderCredentialResult | undefined> {
    const externalProvider = authExternalProviders.find(
        provider => normalizeServerEndpointURL(provider.endpoint) === serverEndpoint
    )

    if (!externalProvider) {
        return undefined
    }

    const result = await executeCommand(externalProvider.executable).catch(error => {
        throw new Error(`Failed to execute external auth command: ${error.message || error}`)
    })

    const credentials = JSON.parse(result) as HeaderCredentialResult

    if (credentials?.expiration) {
        const expirationMs = credentials?.expiration * 1000
        if (expirationMs < Date.now()) {
            throw new Error(
                'Credentials expiration cannot be set to a date in the past: ' +
                    `${new Date(expirationMs)} (${credentials.expiration})`
            )
        }
    }

    return credentials
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

        const extProviderResult = await getExternalProviderHeaders(serverEndpoint, authExternalProviders)
        if (extProviderResult) {
            const headerCredentials: HeaderCredential = {
                expiration: extProviderResult?.expiration,
                async getHeaders() {
                    if (extProviderResult?.expiration) {
                        const expirationMs = extProviderResult?.expiration * 1000
                        if (expirationMs < Date.now()) {
                            try {
                                const newExtProviderResult = await getExternalProviderHeaders(
                                    serverEndpoint,
                                    authExternalProviders
                                )
                                this.expiration = newExtProviderResult?.expiration
                                this.getHeaders = this.getHeaders.bind(newExtProviderResult)
                            } catch (error) {
                                // In case of error we do a config refresh so error can be surfaced to the user
                                logError(
                                    'resolveAuth',
                                    `Failed to get external auth provider data: ${error}`
                                )
                                refreshConfig()
                            }
                        }
                    }

                    return extProviderResult.headers
                },
            }

            return {
                credentials: headerCredentials,
                serverEndpoint,
            }
        }

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
    } catch (error) {
        return {
            credentials: undefined,
            serverEndpoint,
            error,
        }
    }
}
