import { Command } from 'commander'
import { isError } from 'lodash'
import ora from 'ora'
import { AuthenticatedAccount } from './AuthenticatedAccount'
import { failSpinner } from './command-auth'
import { notLoggedIn } from './messages'

export const whoamiCommand = new Command('whoami')
    .description('Print the active authenticated account')
    .action(async () => {
        const spinner = ora('Loading active account')
        try {
            const account = await AuthenticatedAccount.fromUserSettings(spinner)
            if (!account) {
                notLoggedIn(spinner)
                process.exit(1)
            }
            const userInfo = await account.getCurrentUserInfo()
            if (!userInfo || isError(userInfo)) {
                failSpinner(
                    spinner,
                    `Failed to fetch username for account ${account.id} in ${account.serverEndpoint}`,
                    userInfo ?? new Error('no authenticated user')
                )
                process.exit(1)
            } else {
                spinner.succeed(`Authenticated as ${userInfo.username} on ${account.serverEndpoint}`)
                process.exit(0)
            }
        } catch (error) {
            if (error instanceof Error) {
                spinner.prefixText = error.stack ?? ''
                spinner.fail(error.message)
            } else {
                spinner.prefixText = String(error)
                spinner.fail('Failed to load active account')
            }
            process.exit(1)
        }
    })
