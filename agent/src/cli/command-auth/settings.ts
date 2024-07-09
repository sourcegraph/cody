import fs from 'node:fs'

import path from 'node:path'
import { codyPaths } from '../../codyPaths'

export interface Account {
    // In most cases, the ID will be the same as the username.  It's only when
    // you have multiple accounts with the same username on different server
    // endpoints when the ID will be different from the username. Having `id` be
    // separate from `username` avoids ugly workarounds like concatenating
    // `username+serverEndpoint` all over the place.
    readonly id: string
    readonly username: string
    readonly serverEndpoint: string
    readonly preferredModel?: string
    readonly customHeaders?: any
}

export interface UserSettings {
    accounts?: Account[]
    activeAccountID?: string
}

/**
 * Return the file path to the global (aka user) settings file, similar to the
 * "Open User Settings (JSON)" command in VS Code.
 */
export function userSettingsPath(): string {
    return path.join(codyPaths().config, 'user-settings.json')
}

export function writeUserSettings(userSettings: UserSettings): void {
    const settingsPath = userSettingsPath()
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, JSON.stringify(userSettings, null, 2))
}

export function loadUserSettings(): UserSettings {
    const settingsPath = userSettingsPath()
    if (!fs.existsSync(settingsPath)) {
        return {}
    }
    const json = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))

    // Would be nice to have something like zod validation, but manual checking is fine for now
    if (typeof json !== 'object') {
        throw new Error('Invalid user settings. Expected object. Got ' + JSON.stringify(json, null, 2))
    }

    if (json?.accounts && !Array.isArray(json.accounts)) {
        throw new Error(
            'Invalid user settings. Expected accounts to be an array. Got ' +
                JSON.stringify(json.accounts, null, 2)
        )
    }

    for (const account of json.accounts || []) {
        if (!account?.id) {
            throw new Error(
                `Invalid user settings. Missing required field 'id': ${JSON.stringify(account)} `
            )
        }

        // The `username` property was not included in the first version of the cli.
        if (!account?.username) {
            account.username = account?.id
        }
    }

    return json
}
