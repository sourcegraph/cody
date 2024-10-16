import fs from 'node:fs'
import * as path from 'node:path'
import * as dotenv from 'dotenv'
import { CODY_VSCODE_ROOT_DIR } from './helpers'

export default function globalTeardown() {
    const paths = [
        path.resolve(CODY_VSCODE_ROOT_DIR, '..', '.env'),
        path.resolve(CODY_VSCODE_ROOT_DIR, '.env'),
    ]
    commentEnvFileLine(paths, 'CODY_RECORD_IF_MISSING', 'once')
    commentEnvFileLine(paths, 'CODY_RECORDING_MODE', 'once')
}
/**
 * This is used to update the .env file that contributes key with a new value for that key
 * @returns true if the value was updated, false if the key was not found in any of the files
 */
function commentEnvFileLine(envFiles: string[], key: string, expectedValue: string): boolean {
    // Array of .env file paths, ordered by priority

    for (const filePath of envFiles) {
        if (fs.existsSync(filePath)) {
            const envConfig = dotenv.parse(fs.readFileSync(filePath))

            if (key in envConfig) {
                // Found the key in this file, update it
                const fileContent = fs.readFileSync(filePath, 'utf8')
                const updatedContent = fileContent.replace(
                    new RegExp(`^(${key}=${expectedValue})`, 'm'),
                    '# $1'
                )

                fs.writeFileSync(filePath, updatedContent)
                return true
            }
        }
    }

    return false
}
