import http from 'node:http'
import { input, select } from '@inquirer/prompts'
import { SourcegraphGraphQLAPIClient, isError } from '@sourcegraph/cody-shared'
import { Command } from 'commander'
import open from 'open'
import ora from 'ora'
import type { Ora } from 'ora'
import { formatURL } from '../../../../vscode/src/services/AuthProvider'
import { AuthenticatedAccount } from './AuthenticatedAccount'
import { writeCodySecret } from './secrets'
import { type Account, type UserSettings, loadUserSettings, writeUserSettings } from './settings'

interface LoginOptions {
    web: boolean
    accessToken?: string
    endpoint?: string
}

export const loginCommand = new Command('login')
    .description('Log in to Sourcegraph')
    .option('--web', 'Open a browser to authenticate')
    .option(
        '--access-token <token>',
        'Manually provide an access token (env SRC_ACCESS_TOKEN)',
        process.env.SRC_ACCESS_TOKEN
    )
    .option(
        '--endpoint <url>',
        'Manually provide a server endpoint (env SRC_ENDPOINT)',
        process.env.SRC_ENDPOINT ?? 'https://sourcegraph.com/'
    )
    .action(async (options: LoginOptions) => {
        const spinner = ora('Logging in...').start()
        const account = await AuthenticatedAccount.fromUserSettings(spinner)
        if (!spinner.isSpinning) {
            process.exit(1)
        }
        const userInfo = await account?.getCurrentUserInfo()
        if (!isError(userInfo) && userInfo?.username) {
            spinner.succeed('You are already logged in as ' + userInfo.username)
            process.exit(0)
        }
        if (!options.web && !options.accessToken) {
            spinner
                .start()
                .fail(
                    [
                        'Missing required option --web or --access-token. To fix this problem, run:',
                        '  cody auth login --web # Open web browser, OR',
                        '  cody auth login --access-token TOKEN --endpoint URL',
                    ].join('\n')
                )
            process.exit(1)
        }
        try {
            const account = await loginAction(options, spinner)
            if (!account) {
                if (spinner.isSpinning) {
                    spinner.fail('Failed to authenticate')
                }
                process.exit(1)
            }
            const userInfo = await account.getCurrentUserInfo()
            if (!userInfo || isError(userInfo)) {
                spinner.fail(
                    `Failed to fetch username for account ${account.id} in ${account.serverEndpoint}`
                )
                process.exit(1)
            }
            spinner.succeed(
                `Authenticated as ${userInfo.username} at Sourcegraph endpoint ${account.serverEndpoint}`
            )
            process.exit(0)
        } catch (error) {
            if (error instanceof Error) {
                spinner.suffixText = error.stack ?? ''
                spinner.fail(error.message)
            } else {
                spinner.suffixText = String(error)
                spinner.fail('Failed to login')
            }
            process.exit(1)
        }
    })

// "web-login" is when we open the browser via --web
// "cli-login" is when the user provides the access token via --access-token or
// environment variable
type LoginMethod = 'web-login' | 'cli-login'

async function loginAction(
    options: LoginOptions,
    spinner: Ora
): Promise<AuthenticatedAccount | undefined> {
    const loginMethod: LoginMethod =
        options.web && options.accessToken
            ? // Ambiguous, the user provided both --web and --access-token
              await promptUserAboutLoginMethod(spinner, options)
            : options.web
              ? 'web-login'
              : 'cli-login'
    const isCliLogin = loginMethod === 'cli-login'

    const serverEndpoint =
        isCliLogin && options.accessToken && options.endpoint
            ? options.endpoint
            : await promptUserForServerEndpoint(spinner)
    if (!serverEndpoint) {
        return undefined
    }
    if (!spinner.isSpinning) {
        spinner.start('Authenticating')
    }
    const token =
        isCliLogin && options.endpoint && options.accessToken
            ? options.accessToken
            : await captureAccessTokenViaBrowserRedirect(serverEndpoint, spinner)
    const client = new SourcegraphGraphQLAPIClient({
        accessToken: token,
        serverEndpoint: serverEndpoint,
        customHeaders: {},
    })
    const userInfo = await client.getCurrentUserInfo()
    if (isError(userInfo)) {
        spinner.fail('Failed to get username from GraphQL. Error: ' + String(userInfo))
        return undefined
    }
    if (userInfo === null) {
        spinner.fail('No user info returned from GraphQL.')
        return undefined
    }
    const oldSettings = loadUserSettings()
    const id = uniqueID(userInfo.username, oldSettings)
    const account: Account = { id, username: userInfo.username, serverEndpoint }
    const oldAccounts = oldSettings?.accounts
        ? oldSettings.accounts.filter(({ id }) => id !== account.id)
        : []
    await writeCodySecret(spinner, account, token)
    const newAccounts = [account, ...oldAccounts]
    const newSettings: UserSettings = { accounts: newAccounts, activeAccountID: account.id }
    writeUserSettings(newSettings)
    const result = await AuthenticatedAccount.fromUserSettings(spinner)
    return result
}

/**
 * Returns the users's access token via a browser redirect flow.
 *
 * This function creates a local HTTP server that listens for a redirect from the Sourcegraph authentication flow.
 * It opens the Sourcegraph authentication URL in the user's default browser, and waits for the browser to redirect back
 * to the local server with the access token. Once the token is received, the function resolves with the token value.
 */
async function captureAccessTokenViaBrowserRedirect(serverEndpoint: string, spinner: Ora) {
    return await new Promise<string>((resolve, reject) => {
        const server = http.createServer((req, res) => {
            if (!req.url) {
                res.writeHead(400, { 'Content-Type': 'text/plain' })
                res.end('No URL')
                reject('No URL')
                return
            }
            const url = new URL('http://localhost' + req.url)
            const token = url.searchParams.get('token')
            if (token) {
                resolve(token)
                res.writeHead(200, { 'Content-Type': 'text/html' })
                // This HTML is copy-pasted from the JetBrains plugin
                const html =
                    '<!DOCTYPE html><html lang="en"> <head> <meta charset="utf-8"> <title>Cody: Authentication successful</title> </head> <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Oxygen, Ubuntu, Cantarell, \'Open Sans\', \'Helvetica Neue\', sans-serif; background: #f9fafb;"> <div style="margin: 40px auto; text-align: center; max-width: 300px; border: 1px solid #e6ebf2; padding: 40px 20px; border-radius: 8px; background: white; box-shadow: 0px 5px 20px 1px rgba(0, 0, 0, 0.1); "> <svg width="32" height="32" viewBox="0 0 195 176" fill="none" xmlns="http://www.w3.org/2000/svg"> <path fill-rule="evenodd" clip-rule="evenodd" d="M141.819 -8.93872e-07C152.834 -4.002e-07 161.763 9.02087 161.763 20.1487L161.763 55.9685C161.763 67.0964 152.834 76.1172 141.819 76.1172C130.805 76.1172 121.876 67.0963 121.876 55.9685L121.876 20.1487C121.876 9.02087 130.805 -1.38754e-06 141.819 -8.93872e-07Z" fill="#FF5543"/> <path fill-rule="evenodd" clip-rule="evenodd" d="M15.5111 47.0133C15.5111 35.8855 24.44 26.8646 35.4543 26.8646H70.9088C81.9231 26.8646 90.8519 35.8855 90.8519 47.0133C90.8519 58.1411 81.9231 67.162 70.9088 67.162H35.4543C24.44 67.162 15.5111 58.1411 15.5111 47.0133Z" fill="#A112FF"/> <path fill-rule="evenodd" clip-rule="evenodd" d="M189.482 105.669C196.58 112.482 196.868 123.818 190.125 130.989L183.85 137.662C134.75 189.88 51.971 188.579 4.50166 134.844C-2.01751 127.464 -1.38097 116.142 5.92343 109.556C13.2278 102.97 24.434 103.613 30.9532 110.993C64.6181 149.101 123.324 150.024 158.146 112.991L164.42 106.318C171.164 99.1472 182.384 98.8565 189.482 105.669Z" fill="#00CBEC"/> </svg> <h4>Authentication successful</h4> <p style="font-size: 12px;">You may close this tab and return to your editor</p> </body></html>'
                res.end(html)
                return
            }

            res.writeHead(400, { 'Content-Type': 'text/plain' })
            res.end('No token')
            reject('No token')
        })
        server.listen(0, async () => {
            const address = server.address()
            const port = typeof address === 'string' ? new URL(address).port : address?.port
            if (!port) {
                reject('No port')
            }
            const callbackUrl = new URL(
                // TODO CODY-2661 use dedicated CLI callback URL instead of from JetBrains
                '/user/settings/tokens/new/callback?requestFrom=JETBRAINS-' + port,
                serverEndpoint
            )
            spinner.text = `Waiting for browser authentication at ${callbackUrl.href}`
            open(callbackUrl.href)
        })
    })
}

/**
 * Returns a unique ID for the given username and existing user settings.
 *
 * By default, we use the username as the ID. If the username is already taken,
 * we append the lowest integer number that makes the ID unique.
 */
function uniqueID(username: string, settings: UserSettings): string {
    const existingIDs = new Set(settings?.accounts?.map(account => account.id) ?? [])
    const formatID = (username: string, counter: number): string => `${username}-${counter}`
    if (!existingIDs.has(username)) {
        return username
    }
    let counter = 1
    while (existingIDs.has(formatID(username, counter))) {
        counter++
    }
    return formatID(username, counter)
}

/**
 * Uses fancy command-line prompts to ask the user for a Sourcegraph URL (Dotcom or Enterprise).
 */
async function promptUserForServerEndpoint(spinner: Ora): Promise<string | undefined> {
    const dotcom = 'Sign in with sourcegraph.com'
    const enterprise = 'Sign in with Sourcegraph Enterprise'
    spinner.stopAndPersist()
    let endpointOrHostname = await select({
        message: 'Which Sourcegraph instance do you want to authenticate with?',
        choices: [{ value: dotcom }, { value: enterprise }],
    })

    if (endpointOrHostname === enterprise) {
        endpointOrHostname = await input({
            message: 'Enter the URL of the Sourcegraph instance to authenticate with',
        })
    } else if (endpointOrHostname === dotcom) {
        endpointOrHostname = 'sourcegraph.com'
    } else {
        spinner.start().fail(`Invalid reply '${endpointOrHostname}'`)
        return undefined
    }

    spinner.start('Waiting for browser authorization')

    const serverEndpoint = formatURL(endpointOrHostname)
    if (!serverEndpoint) {
        spinner.fail(`Invalid URL ${endpointOrHostname}`)
        return undefined
    }
    return serverEndpoint
}

async function promptUserAboutLoginMethod(spinner: Ora, options: LoginOptions): Promise<LoginMethod> {
    if (!options.accessToken || !options.endpoint) {
        return 'web-login'
    }
    try {
        const client = new SourcegraphGraphQLAPIClient({
            accessToken: options.accessToken,
            serverEndpoint: options.endpoint,
            customHeaders: {},
        })
        const userInfo = await client.getCurrentUserInfo()
        const isValidAccessToken = userInfo && !isError(userInfo)
        if (isValidAccessToken) {
            spinner.stopAndPersist()
            const cliLogin = `Yes, log in as ${userInfo.username} on ${options.endpoint}`
            const webLogin = 'No, log in with my browser via --web'

            const result = await select({
                message: `You are already authenticated as ${userInfo.username} on ${options.endpoint}. Do you want to login with these credentials?`,
                choices: [{ value: cliLogin }, { value: webLogin }],
            })
            return result === webLogin ? 'web-login' : 'cli-login'
        }
    } catch {}
    return 'web-login'
}
