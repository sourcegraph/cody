import { writeFile } from 'node:fs'
import { join } from 'node:path'
import * as codyJson from './commands.json'

/**
 * Builds a cody.json file for testing custom commands and context fetching in e2e test.
 *
 * The file is written to the .vscode directory created in the buildWorkSpaceSettings step
 */
export async function buildCustomCommandConfigFile(workspaceDirectory: string): Promise<void> {
    const codyJsonPath = join(workspaceDirectory, '.vscode', 'cody.json')
    await new Promise<void>((resolve, reject) => {
        writeFile(codyJsonPath, JSON.stringify(codyJson), error => {
            if (error) {
                reject(error)
            } else {
                resolve()
            }
        })
    })
}
