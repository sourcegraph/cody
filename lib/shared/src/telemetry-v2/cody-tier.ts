import type { AuthStatus } from '../auth/types'

enum CodyTier {
    Enterprise = 2,
    NotAuthenticated = 3,
}

export function getTier(authStatus: AuthStatus): CodyTier | undefined {
    return !authStatus.authenticated ? NotAuthenticated : CodyTier.Enterprise
}
