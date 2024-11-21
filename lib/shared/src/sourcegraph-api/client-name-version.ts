// Sourcegraph after 5.4 requires clients to send 'client-name' and
// 'client-version' query parameters. The client pushes its name and version
// here, for requests to Sourcegraph to pick up.

let clientName = ''
let clientVersion = ''

// The name to use as a query parameter to requests to the
// `/.api/completions/stream` endpoint.  The reason this exists is because the
// upstream endpoint rejects valid requests from clients with different names
// from vscode/jetbrains. More details:
// https://github.com/sourcegraph/sourcegraph-public-snapshot/pull/63855
let clientCompletionsStreamQueryParameterName: string | undefined

const CLIENT_NAME_PARAM = 'client-name'
const CLIENT_VERSION_PARAM = 'client-version'

/**
 * Sets the client name and version. These are sent in HTTP parameters to
 * Sourcegraph endpoints, which may block old client versions.
 */
export function setClientNameVersion(params: {
    newClientName: string
    newClientCompletionsStreamQueryParameterName?: string
    newClientVersion: string
}) {
    clientName = params.newClientName
    clientCompletionsStreamQueryParameterName = params.newClientCompletionsStreamQueryParameterName
    clientVersion = params.newClientVersion
}

// See https://github.com/sourcegraph/sourcegraph/pull/943
export function getClientIdentificationHeaders() {
    const runtimeInfo =
        typeof process !== 'undefined' && process.version
            ? `Node.js ${process.version}`
            : typeof navigator !== 'undefined' && navigator.userAgent
              ? `Browser ${navigator.userAgent}`
              : 'Unknown environment'
    const headers: { [header: string]: string } = {
        'User-Agent': `${clientName}/${clientVersion} (${runtimeInfo})`,
    }

    // Only set these headers in non-demo mode, because the demo mode is
    // running in a local server and thus the backend will regard it as an
    // untrusted cross-origin request.
    if (!process.env.CODY_WEB_DEMO) {
        headers['X-Requested-With'] = `${clientName} ${clientVersion}`
    }
    return headers
}

export function addCodyClientIdentificationHeaders(headers: Headers): void {
    for (const [key, value] of Object.entries(getClientIdentificationHeaders())) {
        if (headers.has(key)) {
            continue
        }
        headers.set(key, value)
    }
}

/**
 * Gets the client info querystring parameters to send with HTTP requests.
 */
export function getClientInfoQueryParams() {
    return {
        [CLIENT_NAME_PARAM]: clientCompletionsStreamQueryParameterName ?? clientName,
        [CLIENT_VERSION_PARAM]: clientVersion,
    }
}

/**
 * Adds client info parameters to `params`. These parameters
 * are necessary for Sourcegraph >= 5.4 .api/completions/code and
 * .api/completions/stream endpoints.
 */
export function addClientInfoParams(params: URLSearchParams): void {
    for (const [key, value] of Object.entries(getClientInfoQueryParams())) {
        if (value) {
            params.append(key, value)
        }
    }
}
