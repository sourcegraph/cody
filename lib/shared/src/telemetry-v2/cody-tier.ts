import type { AuthStatus } from '../auth/types'
import { isDotCom } from '../sourcegraph-api/environments'
import type { UserProductSubscription } from '../sourcegraph-api/userProductSubscription'

enum CodyTier {
    Free = 0,
    Pro = 1,
    Enterprise = 2,
    NotAuthenticated = 3,
}

export function getTier(
    authStatus: AuthStatus,
    sub: UserProductSubscription | null
): CodyTier | undefined {
    return !authStatus.authenticated
        ? CodyTier.NotAuthenticated
        : !isDotCom(authStatus)
          ? CodyTier.Enterprise
          : !sub || sub.userCanUpgrade
            ? CodyTier.Free
            : CodyTier.Pro
}
