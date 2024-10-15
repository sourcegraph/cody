import { Command } from 'commander'
import { AuthenticatedAccount } from './command-auth/AuthenticatedAccount'
import { endpointOption } from './command-auth/command-login'
import { accessTokenOption } from './command-auth/command-login'

interface ListModelsOptions {
    accessToken: string
    endpoint: string
}

export const modelsCommand = () =>
    new Command('models').description('Manage models').addCommand(
        new Command('list')
            .addOption(accessTokenOption)
            .addOption(endpointOption)
            .description('List the models IDs that are supported by the connect Sourcegraph instance')
            .action(async (options: ListModelsOptions) => {
                const [account, spinner] =
                    await AuthenticatedAccount.fromUserSettingsOrExitProcess(options)
                const results = await fetch(`${account.serverEndpoint}/.api/llm/models`, {
                    headers: {
                        Authorization: `token ${account.accessToken}`,
                    },
                })
                if (!results.ok) {
                    spinner.fail(
                        `Failed to list models: ${results.statusText}\n${await results.text()}\n`
                    )
                    process.exit(1)
                }
                const json: { data: { id: string }[] } = (await results.json()) as any
                spinner.stop()
                for (const { id } of json.data) {
                    process.stdout.write(`${id}\n`)
                }
                process.exit(0)
            })
    )
