// `TESTING_DOTCOM_URL` is not set in webviews. If `isDotCom` helper it called from the webview it will use

import type { AuthStatus } from '../auth/types'

// the default ('https://sourcegraph.com') value.
export const DOTCOM_URL = new URL(
    (typeof process === 'undefined' ? null : process.env.TESTING_DOTCOM_URL) ??
        'https://sourcegraph.com/'
)

// 🚨 SECURITY: This is used as a check for logging chatTranscript for dotcom users only, be extremely careful if modifying this function
export function isDotCom(authStatus: Pick<AuthStatus, 'endpoint'> | undefined): boolean
export function isDotCom(url: string): boolean
export function isDotCom(arg: Pick<AuthStatus, 'endpoint'> | undefined | string): boolean {
    const url = typeof arg === 'string' ? arg : arg?.endpoint
    if (url === undefined) {
        return false
    }
    try {
        return new URL(url).origin === DOTCOM_URL.origin
    } catch {
        return false
    }
}

export const S2_URL = new URL('https://sourcegraph.sourcegraph.com/')

// 🚨 SECURITY: This is used as a check for logging chatTranscript for S2 users only, be extremely careful if modifying this function
export function isS2(authStatus: Pick<AuthStatus, 'endpoint'> | undefined): boolean
export function isS2(url: string): boolean
export function isS2(arg: Pick<AuthStatus, 'endpoint'> | undefined | string): boolean {
    const url = typeof arg === 'string' ? arg : arg?.endpoint
    if (url === undefined) {
        return false
    }
    try {
        return new URL(url).origin === S2_URL.origin
    } catch {
        return false
    }
}
