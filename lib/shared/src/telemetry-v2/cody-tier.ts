import type { AuthStatus } from '../auth/types'

enum CodyTier {
    Free = 0,
    Pro = 1,
    Enterprise = 2,
}

export function getTier(authStatus: AuthStatus): CodyTier {
    return !authStatus.isDotCom
        ? CodyTier.Enterprise
        : authStatus.userCanUpgrade
          ? CodyTier.Free
          : CodyTier.Pro
}
