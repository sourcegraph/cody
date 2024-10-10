import {
    type AuthStatus,
    currentAuthStatus,
    currentAuthStatusOrNotReadyYet,
} from '@sourcegraph/cody-shared'
import type { ProtocolAuthStatus } from './protocol-alias'

export function toProtocolAuthStatus(status: AuthStatus): ProtocolAuthStatus {
    if (status.authenticated) {
        return {
            status: 'authenticated',
            ...status,
        }
    }
    return {
        status: 'unauthenticated',
        ...status,
    }
}

export function currentProtocolAuthStatus(): ProtocolAuthStatus {
    return toProtocolAuthStatus(currentAuthStatus())
}

export function currentProtocolAuthStatusOrNotReadyYet(): ProtocolAuthStatus | undefined {
    const status = currentAuthStatusOrNotReadyYet()
    if (status) {
        return toProtocolAuthStatus(status)
    }
    return undefined
}
