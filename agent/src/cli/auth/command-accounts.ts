import chalk from 'chalk'
import { Command } from 'commander'
import Table from 'easy-table'
import { isError } from 'lodash'
import ora from 'ora'
import { AuthenticatedAccount } from './AuthenticatedAccount'
import { booleanToText, failSpinner } from './command-auth'
import { notLoggedIn } from './messages'
import { loadUserSettings } from './settings'

export const accountsCommand = new Command('accounts')
    .description('Print all the authenticated accounts')
    .action(async () => {
        const spinner = ora('Loading active accounts')
        try {
            const settings = loadUserSettings()
            if (!settings?.accounts || settings.accounts.length === 0) {
                notLoggedIn(spinner)
                process.exit(1)
            }
            const t = new Table()
            for (const account of settings.accounts ?? []) {
                const authenticated = await AuthenticatedAccount.fromUnauthenticated(spinner, account)
                t.cell(chalk.bold('Name'), account.id)
                t.cell(chalk.bold('Instance'), account.serverEndpoint)
                const isActiveAccount = account.id === settings.activeAccountID
                t.cell(chalk.bold('Active'), booleanToText(isActiveAccount))
                const userInfo = await authenticated?.getCurrentUserInfo()
                const isAuthenticated = Boolean(userInfo) && !isError(userInfo)
                t.cell(chalk.bold('Authenticated'), booleanToText(isAuthenticated))
                t.newRow()
            }
            console.log(t.toString())
            process.exit(0)
        } catch (error) {
            if (error instanceof Error) {
                failSpinner(spinner, 'Failed to load active accounts', error)
            } else {
                spinner.prefixText = String(error)
                spinner.fail('Failed to load active account')
            }
            process.exit(1)
        }
    })
