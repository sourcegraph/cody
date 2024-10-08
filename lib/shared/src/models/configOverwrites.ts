import { Observable, map } from 'observable-fns'
import { authStatus } from '../auth/authStatus'
import { logError } from '../logger'
import { distinctUntilChanged, pick, promiseFactoryToObservable } from '../misc/observable'
import { pendingOperation, switchMapReplayOperation } from '../misc/observableOperation'
import { type CodyLLMSiteConfiguration, graphqlClient } from '../sourcegraph-api/graphql/client'
import { isError } from '../utils'

/**
 * Observe the model-related config overwrites on the server for the currently authenticated user.
 */
export const configOverwrites: Observable<CodyLLMSiteConfiguration | null | typeof pendingOperation> =
    authStatus.pipe(
        pick('authenticated', 'endpoint', 'pendingValidation'),
        distinctUntilChanged(),
        switchMapReplayOperation(
            (
                authStatus
            ): Observable<CodyLLMSiteConfiguration | Error | null | typeof pendingOperation> => {
                if (authStatus.pendingValidation) {
                    return Observable.of(pendingOperation)
                }

                if (!authStatus.authenticated) {
                    return Observable.of(null)
                }

                return promiseFactoryToObservable(signal =>
                    graphqlClient.getCodyLLMConfiguration(signal)
                ).pipe(
                    map((result): CodyLLMSiteConfiguration | null | typeof pendingOperation => {
                        if (isError(result)) {
                            logError(
                                'configOverwrites',
                                `Failed to get Cody LLM configuration from ${authStatus.endpoint}: ${result}`
                            )
                            return null
                        }
                        return result ?? null
                    })
                )
            }
        ),
        map(result => (isError(result) ? null : result)) // the operation catches its own errors, so errors will never get here
    )

// Subscribe so that other subscribers get the replayed value. There are no other permanent
// subscribers to this value.
//
// TODO(sqs): This fixes an issue where switching accounts (`rtx exec node@18.17.1 -- pnpm run test
// agent/src/auth.test.ts -t 'switches'`) took ~2.7s on Node 18.
configOverwrites.subscribe({})
