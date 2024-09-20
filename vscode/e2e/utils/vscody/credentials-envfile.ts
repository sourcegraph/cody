import { execSync } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import dedent from 'dedent'
import { CODY_VSCODE_ROOT_DIR } from '../helpers'

const existingRegex = /^([^=]+)=(.*)$/m
export const CREDENTIALS_ENVFILE_PATH = path.join(CODY_VSCODE_ROOT_DIR, '.credentials.env')

// This generates .credentials.env file and automatically updates the keys if
// the user has access to the required gcloud secrets. These keys are needed to
// update recordings and it's a bit tedious for a user to have to remember to
// update/fetch them. These keys are later used in the MitM proxy to substitue a
// PLACEHOLDER_TOKEN that is sent with every request coming from Cody. The
// reason for caching them in a file is because the cli command adds significant
// overhead on every test run otherwise.

// 🚨 To mitigate the fallout from accidentally checking in these keys into the
// repo, or the .env file leaking otherwise we also generate a set of random
// encryption keys in a tempfile on the machine. We use these machine specific
// keys to encrypt the keys in the .env file. So as long as this tempfile exists
// the keys can be re-used.

// To make sure that we still "discover" leaked keys we make sure that after
// encryption the keys are once again placed into the same recognizable format.
// This means that although the keys in the .env file might look recognizable
// they can't directly be used.

const keyName = `${crypto.createHash('md5').update(`cody-e2e-keys-${os.hostname()}`).digest('hex')}`
const keyPath = path.join(os.tmpdir(), keyName)

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

/**
 * Decrypts and updates environment variables
 */
export function setEnvDecrypted(keys: Array<(typeof tokenExportedNames)[number]> = tokenExportedNames) {
    let encryptionKey: string
    try {
        encryptionKey = fs.readFileSync(keyPath, 'utf-8')
    } catch {
        return
    }

    for (const key of keys) {
        const encryptedValue = process.env[key]
        if (encryptedValue) {
            process.env[key] = decrypt(encryptedValue, encryptionKey)
        }
    }
}

/**
 * Encrypts a credential key in such a way that they still follow the correct
 * format And maintains the instance signature. e.g. only the last part of the
 * key is encrypted:
 * sgp_000000000000000_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
 */
function encrypt(decrypted: string, key: string): string {
    const parts = decrypted.split('_')
    if (parts.length !== 3) {
        throw new Error('Invalid credential format')
    }

    const [prefix, instance, secret] = parts
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv)
    let encrypted = cipher.update(secret, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    return `${prefix}_${instance}_locked${iv.toString('hex')}${encrypted}`
}

/**
 * Decrypts a credential key
 */
function decrypt(encrypted: string, key: string): string {
    const parts = encrypted.split('_')
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted credential format')
    }

    const [prefix, instance, signatureEncryptedData] = parts
    if (!signatureEncryptedData.startsWith('locked')) {
        // this is already decrypted
        return `${prefix}_${instance}_${signatureEncryptedData}`
    }
    const encryptedData = signatureEncryptedData.replace('locked', '')
    const iv = Buffer.from(encryptedData.slice(0, 32), 'hex')
    const encryptedSecret = encryptedData.slice(32)

    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv)
    let decrypted = decipher.update(encryptedSecret, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return `${prefix}_${instance}_${decrypted}`
}

/**
 * either gets or creates a temporary key on the machine that can be used to
 * encrypt/decrypt the keys stored in the .env file
 */
async function upsertEncryptionKey(): Promise<string> {
    try {
        // Try to read the existing key
        const existingKey = await fs.promises.readFile(keyPath, 'utf-8')

        // Validate that the key is a valid 32 byte key
        if (existingKey.trim().length !== 64) {
            throw new Error('Invalid key length')
        }
        return existingKey.trim()
    } catch (error) {
        // If the file doesn't exist or there's an error reading it, create a new key
        const newKey = crypto.randomBytes(32).toString('hex')
        await fs.promises.writeFile(keyPath, newKey, 'utf-8')
        return newKey
    }
}

function getExistingValues(): Map<string, string> {
    const existingContent = (() => {
        try {
            return fs.readFileSync(CREDENTIALS_ENVFILE_PATH, 'utf-8')
        } catch {
            return ''
        }
    })()
    const values = new Map<string, string>()
    for (const line of existingContent.split('\n')) {
        const match = existingRegex.exec(line)
        if (match) {
            const [, name, value] = match
            if (tokenExportedNames.includes(name as any)) {
                values.set(name, value)
            }
        }
    }

    return values
}

async function withMissingValues(values: Map<string, string>) {
    const withMissing = new Map(values)
    const encryptionKey = await upsertEncryptionKey()

    for (const [exportedName, secretName] of tokens) {
        try {
            if (withMissing.has(exportedName)) {
                continue
            }
            const token = execSync(
                `gcloud secrets versions access latest --secret ${secretName} --project cody-agent-tokens --quiet`,
                { encoding: 'utf-8' }
            )
            const encryptedToken = encrypt(token.trim(), encryptionKey)
            withMissing.set(exportedName, encryptedToken)
        } catch {
            // ignore
        }
    }
    return withMissing
}
/**
 * @returns true if env file was updated
 */
export async function updateEnvFile(): Promise<boolean> {
    const existingValues = getExistingValues()
    const values = await withMissingValues(existingValues)

    let hasChanges = false
    for (const name of Array.from(values.keys())) {
        if (existingValues.get(name) !== values.get(name)) {
            hasChanges = true
        }
    }

    if (!hasChanges) {
        return false
    }

    const content = dedent(`
        # This file is automatically generated by \`scripts/export-credentials.ts\`

        ${Array.from(values.entries())
            .map(([name, value]) => `${name}=${value}`)
            .sort()
            .join('\n')}
    `)

    fs.writeFileSync(CREDENTIALS_ENVFILE_PATH, content)

    return true
}
