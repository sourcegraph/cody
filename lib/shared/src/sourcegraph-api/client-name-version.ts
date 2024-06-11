// Sourcegraph after 5.4 requires clients to send 'client-name' and
// 'client-version' query parameters. The client pushes its name and version
// here, for requests to Sourcegraph to pick up.

let clientName = ''
let clientVersion = ''

const CLIENT_NAME_PARAM = 'client-name'
const CLIENT_VERSION_PARAM = 'client-version'

/**
 * Sets the client name and version. These are sent in HTTP parameters to
 * Sourcegraph endpoints, which may block old client versions.
 */
export function setClientNameVersion(newClientName: string, newClientVersion: string) {
    clientName = newClientName
    clientVersion = newClientVersion
}

/**
 * Gets the client info querystring parameters to send with HTTP requests.
 */
export function getClientInfoParams() {
    return {
        [CLIENT_NAME_PARAM]: clientName,
        [CLIENT_VERSION_PARAM]: clientVersion,
    }
}

/**
 * Adds client info parameters to `params`. These parameters
 * are necessary for Sourcegraph >= 5.4 .api/completions/code and
 * .api/completions/stream endpoints.
 */
export function addClientInfoParams(params: URLSearchParams): void {
    for (const [key, value] of Object.entries(getClientInfoParams())) {
        if (value) {
            params.append(key, value)
        }
    }
}
