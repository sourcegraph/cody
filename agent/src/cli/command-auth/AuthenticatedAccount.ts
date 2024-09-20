import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared'
import type { Ora } from 'ora'
import { readCodySecret } from './secrets'

import type { CurrentUserInfo } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import isError from 'lodash/isError'
import type { AuthenticationOptions } from './command-login'
import { type Account, loadUserSettings } from './settings'

type AuthenticationSource = 'ENVIRONMENT_VARIABLE' | 'SECRET_STORAGE'

/**
 * Wrapper around `Account` with the addition of an access token that's loaded
 * from the OS keychain.
 */
export class AuthenticatedAccount {
    private constructor(
        public readonly account: Account,
        public readonly accessToken: string,
        public readonly userInfo: CurrentUserInfo,
        public readonly source: AuthenticationSource
    ) {}

    get id(): string {
        return this.account.id
    }

    get serverEndpoint(): string {
        return this.account.serverEndpoint
    }

    get username(): string {
        return this.account.username
    }

    private static async fromCredentials(
        options: AuthenticationOptions,
        source: AuthenticationSource
    ): Promise<AuthenticatedAccount | Error> {
        const graphqlClient = SourcegraphGraphQLAPIClient.withStaticConfig({
            configuration: { telemetryLevel: 'agent' },
            auth: { accessToken: options.accessToken, serverEndpoint: options.endpoint },
            clientState: { anonymousUserID: null },
        })
        const userInfo = await graphqlClient.getCurrentUserInfo()
        if (isError(userInfo)) {
            return userInfo
        }
        if (!userInfo?.username) {
            return new Error(
                'failed to authenticated with credentials from environment variable SRC_ACCESS_TOKEN'
            )
        }
        return new AuthenticatedAccount(
            {
                id: userInfo.username,
                username: userInfo.username,
                serverEndpoint: options.endpoint,
            },
            options.accessToken,
            userInfo,
            source
        )
    }

    public static async fromUserSettings(
        spinner: Ora,
        environmentVariables: AuthenticationOptions
    ): Promise<AuthenticatedAccount | Error | undefined> {
        if (environmentVariables.accessToken) {
            const account = await AuthenticatedAccount.fromCredentials(
                environmentVariables,
                'ENVIRONMENT_VARIABLE'
            )
            if (isError(account)) {
                return account
            }
            return account
        }
        const settings = loadUserSettings()
        if (!settings.activeAccountID) {
            return undefined
        }
        const account = settings.accounts?.find(({ id }) => id === settings.activeAccountID)
        if (!account) {
            spinner.fail(`Failed to find active account ${settings.activeAccountID}`)
            return undefined
        }
        return AuthenticatedAccount.fromUnauthenticated(spinner, account)
    }

    public static async fromUnauthenticated(
        spinner: Ora,
        account: Account
    ): Promise<AuthenticatedAccount | Error | undefined> {
        const accessToken = await readCodySecret(spinner, account)
        if (!accessToken) {
            return undefined
        }
        return AuthenticatedAccount.fromCredentials(
            { accessToken, endpoint: account.serverEndpoint },
            'SECRET_STORAGE'
        )
    }
}
