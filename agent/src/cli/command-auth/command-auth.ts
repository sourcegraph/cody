import { Command } from 'commander'
import type { Ora } from 'ora'
import { accountsCommand } from './command-accounts'
import { loginCommand } from './command-login'
import { logoutCommand } from './command-logout'
import { whoamiCommand } from './command-whoami'
import { userSettingsPath } from './settings'

export const authCommand = () =>
    new Command('auth')
        .description('Authenticate Cody with Sourcegraph')
        .addCommand(loginCommand)
        .addCommand(logoutCommand)
        .addCommand(whoamiCommand)
        .addCommand(accountsCommand)
        .addCommand(
            new Command('settings-path')
                .description('Print out the path to the user settings (JSON)')
                .action(() => {
                    process.stdout.write(userSettingsPath() + '\n')
                    process.exit(0)
                })
        )

export function booleanToText(value: boolean): string {
    return value ? 'Yes' : 'No'
}

export function failSpinner(spinner: Ora, text: string, error: Error): void {
    spinner.prefixText = error.stack ?? error.message
    spinner.fail(text)
}
