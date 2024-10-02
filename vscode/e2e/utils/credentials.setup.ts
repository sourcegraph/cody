import { test as setup } from '@playwright/test'

import { execSync } from 'node:child_process'
import keytar from 'keytar'

const tokens = [
    // [EXPORTED_NAME, SECRET_NAME]
    ['SRC_DOTCOM_PRO_ACCESS_TOKEN', 'CODY_PRO_ACCESS_TOKEN'] as const,
    // # This is a token for a Cody Pro account with rate limits.
    ['SRC_DOTCOM_PRO_RATE_LIMIT_ACCESS_TOKEN', 'CODY_PRO_RATE_LIMITED_ACCESS_TOKEN'] as const,
    // # This is a token for a Cody Free account that is rate limited.
    ['SRC_ACCESS_TOKEN_FREE_USER_WITH_RATE_LIMIT', 'CODY_FREE_RATE_LIMITED_ACCESS_TOKEN'] as const,
    ['SRC_ENTERPRISE_ACCESS_TOKEN', 'CODY_ENTERPRISE_ACCESS_TOKEN'] as const,
    ['SRC_S2_ACCESS_TOKEN', 'CODY_S2_ACCESS_TOKEN'] as const,
] as const
const tokenExportedNames = Array.from(tokens.map(([exportedName]) => exportedName))

setup.extend<{}>({})('credentials', async ({}) => {
    for (const [key, value] of (await getLatest()).entries()) {
        const renamedKey = tokens.find(t => t[0] === key)![0]
        process.env[renamedKey] = value
    }

    // NOTE: VSCode Playwright UI will abort the running test when it
    // detects a file change. So you'll in some cases have to click the run
    // test button twice. Every other case seems to work fine.
})

async function getExistingValues(): Promise<Map<string, string>> {
    const credentials = await keytar.findCredentials('cody.e2e')
    const values = new Map<string, string>()

    for (const credential of credentials) {
        if (tokenExportedNames.includes(credential.account as any)) {
            values.set(credential.account, credential.password)
        }
    }

    return values
}

async function withMissingValues(values: Map<string, string>) {
    const withMissing = new Map(values)

    for (const [exportedName, secretName] of tokens) {
        try {
            if (withMissing.has(exportedName)) {
                continue
            }
            const token = execSync(
                `gcloud secrets versions access latest --secret ${secretName} --project cody-agent-tokens --quiet`,
                { encoding: 'utf-8' }
            )
            withMissing.set(exportedName, token)
        } catch {
            // ignore
        }
    }
    return withMissing
}
/**
 * @returns true if env file was updated
 */
export async function getLatest(): Promise<Map<string, string>> {
    const existingValues = await getExistingValues()
    const values = await withMissingValues(existingValues)

    for (const name of Array.from(values.keys())) {
        if (existingValues.get(name) !== values.get(name)) {
            const token = values.get(name)
            if (token) {
                await keytar.setPassword('cody.e2e', name, token)
            }
        }
    }

    return values
}

export async function clearCached(): Promise<void> {
    const credentials = await keytar.findCredentials('cody.e2e')
    for (const credential of credentials) {
        await keytar.deletePassword('cody.e2e', credential.account)
    }
}
