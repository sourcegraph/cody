import { Command } from 'commander'
import isError from 'lodash/isError'
import ora from 'ora'
import { AuthenticatedAccount } from './AuthenticatedAccount'
import { type AuthenticationOptions, accessTokenOption, endpointOption } from './command-login'
import { errorSpinner, notAuthenticated, unknownErrorSpinner } from './messages'

export const whoamiCommand = new Command('whoami')
    .description('Print the active authenticated account')
    .addOption(accessTokenOption)
    .addOption(endpointOption)
    .action(async (options: AuthenticationOptions) => {
        const spinner = ora('Loading active account')
        try {
            const account = await AuthenticatedAccount.fromUserSettings(spinner, options)
            if (isError(account)) {
                errorSpinner(spinner, account, options)
                process.exit(1)
            }
            if (!account?.username) {
                notAuthenticated(spinner)
                process.exit(1)
            }

            spinner.succeed(`Authenticated as ${account.username} on ${account.serverEndpoint}`)
            process.exit(0)
        } catch (error) {
            unknownErrorSpinner(spinner, error, options)
            process.exit(1)
        }
    })
