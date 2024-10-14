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
    return {
        'User-Agent': `${clientName}/${clientVersion} (Node.js ${process.version})`,
        'X-Client-Name': clientName,
        'X-Client-Version': clientVersion,
    }
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
