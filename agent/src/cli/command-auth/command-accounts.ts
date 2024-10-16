import chalk from 'chalk'
import { Command } from 'commander'
import Table from 'easy-table'
import isError from 'lodash/isError'
import ora from 'ora'
import { AuthenticatedAccount } from './AuthenticatedAccount'
import { booleanToText } from './command-auth'
import { type AuthenticationOptions, accessTokenOption, endpointOption } from './command-login'
import { notAuthenticated, unknownErrorSpinner } from './messages'
import { loadUserSettings } from './settings'

export const accountsCommand = new Command('accounts')
    .description('Print all the authenticated accounts')
    .addOption(accessTokenOption)
    .addOption(endpointOption)
    .action(async (options: AuthenticationOptions) => {
        const spinner = ora('Loading active accounts')
        try {
            const settings = loadUserSettings()
            if (!settings?.accounts || settings.accounts.length === 0) {
                notAuthenticated(spinner)
                process.exit(1)
            }
            const t = new Table()
            for (const account of settings.accounts ?? []) {
                t.cell(chalk.bold('Name'), account.id)
                t.cell(chalk.bold('Instance'), account.serverEndpoint)
                const isActiveAccount = account.id === settings.activeAccountID
                t.cell(chalk.bold('Active'), booleanToText(isActiveAccount))
                const authenticated = await AuthenticatedAccount.fromUnauthenticated(spinner, account)
                t.cell(
                    chalk.bold('Authenticated'),
                    isError(authenticated)
                        ? 'Invalid credentials'
                        : booleanToText(Boolean(authenticated))
                )
                t.newRow()
            }
            console.log(t.toString())
            process.exit(0)
        } catch (error) {
            unknownErrorSpinner(spinner, error, options)
            process.exit(1)
        }
    })
