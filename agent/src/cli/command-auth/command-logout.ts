import { Command } from 'commander'
import ora from 'ora'
import { removeCodySecret } from './secrets'
import { loadUserSettings, userSettingsPath, writeUserSettings } from './settings'

export const logoutCommand = new Command('logout')
    .description('Log out of Sourcegraph')
    .action(async () => {
        const spinner = ora('Loading active accounts')
        try {
            const settings = loadUserSettings()
            if (!settings?.accounts || settings.accounts.length === 0 || !settings.activeAccountID) {
                spinner.fail('You are already logged out')
                process.exit(1)
            }
            const account = settings.accounts.find(account => account.id === settings.activeAccountID)
            if (!account) {
                spinner.fail(
                    `Failed to find active account with ID '${
                        settings.activeAccountID
                    }'. To fix this problem, consider manually editing or deleting the user settings file:\n  ${userSettingsPath()}`
                )
                process.exit(1)
            }
            await removeCodySecret(spinner, account)
            const newAccounts = settings.accounts.filter(
                account => account.id !== settings.activeAccountID
            )
            writeUserSettings({ accounts: newAccounts })
            spinner.succeed(`Logged out of account ${account.username} on ${account.serverEndpoint}`)
            process.exit(0)
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
