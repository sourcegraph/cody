// `CODY_OVERRIDE_DOTCOM_URL` is not set in webviews. If `isDotCom` helper it called from the webview it will use

import type { AuthStatus } from '../auth/types'
import { cenv } from '../configuration/environment'

// the default ('https://sourcegraph.com') value.
export const DOTCOM_URL = new URL(cenv.CODY_OVERRIDE_DOTCOM_URL || 'https://sourcegraph.com/')

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

// TODO: Update to live link https://linear.app/sourcegraph/issue/CORE-535/cody-clients-migrate-ctas-to-live-links
export const DOTCOM_WORKSPACE_UPGRADE_URL = new URL('https://sourcegraph.com/cody/manage')
export const SG_WORKSPACES_URL = new URL('https://workspaces.sourcegraph.com')

export const Workspaces_Host_Prod = '.sourcegraph.app'
export const Workspaces_Host_Dev = '.sourcegraphapp.test:3443'

// 🚨 SECURITY: This is used to validate a set of URLs we will allow to be passed in
//              to the editor in the URL handler.
export function isWorkspaceInstance(authStatus: Pick<AuthStatus, 'endpoint'> | undefined): boolean
export function isWorkspaceInstance(url: string): boolean
export function isWorkspaceInstance(arg: Pick<AuthStatus, 'endpoint'> | undefined | string): boolean {
    const url = typeof arg === 'string' ? arg : arg?.endpoint
    if (url === undefined) {
        return false
    }
    try {
        return (
            new URL(url).host.endsWith(Workspaces_Host_Prod) ||
            new URL(url).host.endsWith(Workspaces_Host_Dev)
        )
    } catch {
        return false
    }
}
