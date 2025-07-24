import type { AuthStatus } from '../auth/types'

enum CodyTier {
    Enterprise = 2,
    NotAuthenticated = 3,
}

export function getTier(authStatus: AuthStatus): CodyTier {
    return authStatus.authenticated ? CodyTier.Enterprise : CodyTier.NotAuthenticated
}
