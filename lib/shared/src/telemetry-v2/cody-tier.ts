import type { AuthStatus } from '../auth/types'
import { isDotCom } from '../sourcegraph-api/environments'

enum CodyTier {
    Free = 0,
    Pro = 1,
    Enterprise = 2,
}

export function getTier(authStatus: AuthStatus): CodyTier {
    return !isDotCom(authStatus)
        ? CodyTier.Enterprise
        : authStatus.userCanUpgrade
          ? CodyTier.Free
          : CodyTier.Pro
}
