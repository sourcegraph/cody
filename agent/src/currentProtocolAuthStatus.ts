import type { AuthStatus } from '@sourcegraph/cody-shared'
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
