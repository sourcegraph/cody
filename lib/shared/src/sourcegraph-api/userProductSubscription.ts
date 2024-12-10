import { Observable, map } from 'observable-fns'
import { authStatus } from '../auth/authStatus'
import { logError } from '../logger'
import {
    debounceTime,
    distinctUntilChanged,
    pick,
    promiseFactoryToObservable,
    storeLastValue,
} from '../misc/observable'
import {
    firstResultFromOperation,
    pendingOperation,
    switchMapReplayOperation,
} from '../misc/observableOperation'
import { isError } from '../utils'
import { isDotCom } from './environments'
import { graphqlClient } from './graphql'

export interface UserProductSubscription {
    // TODO(sqs): this is the only field related to the user's subscription we were using previously
    // in AuthStatus, so start with just it and we can add more.

    /**
     * Whether the user is on Cody Free (i.e., can upgrade to Cody Pro). This is `false` for
     * enterprise users because they already have a higher degree of access than Cody Free/Pro.
     *
     * It's used to customize rate limit messages and show upgrade buttons in the UI.
     */
    userCanUpgrade: boolean
}

/**
 * Observe the currently authenticated user's Cody subscription status (for Sourcegraph.com Cody
 * Free/Pro users only).
 */
export const userProductSubscription: Observable<
    UserProductSubscription | null | typeof pendingOperation
> = authStatus.pipe(
    pick('authenticated', 'endpoint', 'pendingValidation'),
    distinctUntilChanged(),
    debounceTime(0),
    switchMapReplayOperation(
        (authStatus): Observable<UserProductSubscription | Error | null | typeof pendingOperation> => {
            if (authStatus.pendingValidation) {
                return Observable.of(pendingOperation)
            }

            if (!authStatus.authenticated) {
                return Observable.of(null)
            }

            if (!isDotCom(authStatus)) {
                return Observable.of(null)
            }

            return promiseFactoryToObservable(signal =>
                graphqlClient.getCurrentUserCodySubscription(signal)
            ).pipe(
                map((sub): UserProductSubscription | null | typeof pendingOperation => {
                    if (isError(sub)) {
                        logError(
                            'userProductSubscription',
                            `Failed to get the Cody product subscription info from ${authStatus.endpoint}: ${sub}`
                        )
                        return null
                    }
                    const isActiveProUser =
                        sub !== null && 'plan' in sub && sub.plan === 'PRO' && sub.status !== 'PENDING'
                    return {
                        userCanUpgrade: !isActiveProUser,
                    }
                })
            )
        }
    ),
    map(result => (isError(result) ? null : result)) // the operation catches its own errors, so errors will never get here
)

const userProductSubscriptionStorage = storeLastValue(userProductSubscription)

/**
 * Get the current user's product subscription info. If authentication is pending, it awaits
 * successful authentication.
 */
export function currentUserProductSubscription(): Promise<UserProductSubscription | null> {
    return firstResultFromOperation(userProductSubscriptionStorage.observable)
}

/**
 * Get the current user's last-known product subscription info. Using this introduce a race
 * condition if auth is pending.
 */
export function cachedUserProductSubscription(): UserProductSubscription | null {
    const value = userProductSubscriptionStorage.value.last
    return value === pendingOperation || !value ? null : value
}
