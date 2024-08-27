import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared'
import type { Ora } from 'ora'
import { readCodySecret } from './secrets'

import type { CurrentUserInfo } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import { type Account, loadUserSettings } from './settings'

/**
 * Wrapper around `Account` with the addition of an access token that's loaded
 * from the OS keychain.
 */
export class AuthenticatedAccount {
    public graphqlClient: SourcegraphGraphQLAPIClient

    private userInfo: CurrentUserInfo | Error | null = null
    private constructor(
        public readonly account: Account,
        public readonly accessToken: string
    ) {
        this.graphqlClient = new SourcegraphGraphQLAPIClient({
            accessToken: this.accessToken,
            customHeaders: this.account.customHeaders,
            serverEndpoint: this.account.serverEndpoint,
        })
    }

    public async getCurrentUserInfo(): Promise<CurrentUserInfo | null | Error> {
        if (!this.userInfo) {
            this.userInfo = await this.graphqlClient.getCurrentUserInfo()
        }
        return this.userInfo
    }

    get id(): string {
        return this.account.id
    }

    get serverEndpoint(): string {
        return this.account.serverEndpoint
    }

    public static async fromUserSettings(spinner: Ora): Promise<AuthenticatedAccount | undefined> {
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
    ): Promise<AuthenticatedAccount | undefined> {
        const accessToken = await readCodySecret(spinner, account)
        if (!accessToken) {
            return undefined
        }
        return new AuthenticatedAccount(account, accessToken)
    }
}
