import type {
    AuthCredentials,
    ClientConfiguration,
    ExternalAuthCommand,
    ExternalAuthProvider,
} from '../configuration'
import type { ClientSecrets } from './resolver'

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
        env: cmd.environment ? { ...process.env, ...cmd.environment } : process.env,
    })

    return stdout.trim()
}

interface HeaderCredentialResult {
    headers: Record<string, string>
    expiration: number | undefined
}

async function getExternalProviderAuthResult(
    serverEndpoint: string,
    authExternalProviders: readonly ExternalAuthProvider[]
): Promise<HeaderCredentialResult | undefined> {
    const externalProvider = authExternalProviders.find(
        provider => normalizeServerEndpointURL(provider.endpoint) === serverEndpoint
    )

    if (externalProvider) {
        const result = await executeCommand(externalProvider.executable)
        return JSON.parse(result)
    }

    return undefined
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

    if (overrideAuthToken) {
        return { credentials: { token: overrideAuthToken }, serverEndpoint }
    }

    const credentials = await getExternalProviderAuthResult(serverEndpoint, authExternalProviders).catch(
        error => {
            throw new Error(`Failed to execute external auth command: ${error}`)
        }
    )

    if (credentials) {
        return {
            credentials: {
                expiration: credentials.expiration,
                getHeaders() {
                    return credentials.headers
                },
            },
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
}
