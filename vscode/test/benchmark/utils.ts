import { exec as _exec } from 'child_process'
import { readFileSync } from 'fs'
import { copyFile, cp, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'

import { TEST_WORKSPACE_PATH } from './constants'
import { commitSignatureEnv } from './git'

const exec = promisify(_exec)

export const copyFileToWorkspace = async (workspaceDir: string, fileName: string, cwd: string): Promise<void> => {
    const filePath = path.join(cwd, fileName)
    const tempFilePath = path.join(workspaceDir, path.basename(filePath))
    await copyFile(filePath, tempFilePath)
}

export const createTemporaryWorkspace = async (filePaths: string[], cwd: string): Promise<string> => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'cody-benchmark-'))
    for (const file of filePaths) {
        await copyFileToWorkspace(tempDir, file, cwd)
    }

    // Add any workspace fixture files
    await cp(TEST_WORKSPACE_PATH, tempDir, { recursive: true })

    // Create a Git repo and commit the copied files. This will give us a useful way to compare any future changes.
    await exec('git init --quiet', { cwd: tempDir })
    await exec('git add --all', { cwd: tempDir })
    await exec('git commit -m "init"', { cwd: tempDir, env: commitSignatureEnv })

    return tempDir
}

export interface DatasetConfig {
    entryFile: string
    openFiles: string[]
    closedFiles: string[]
    solutionFile: string
    testFile: string
    testCommand: string
}

export function parseEvaluationConfig(path: string): DatasetConfig {
    try {
        const file = readFileSync(path, 'utf8')
        const config = JSON.parse(file) as DatasetConfig
        return config
    } catch (error) {
        console.error(`Error parsing dataset config file ${path}: ${error}`)
        throw error
    }
}

export const assertEnv = (key: string): string => {
    const env = process.env[key]

    if (!env) {
        throw new Error(`${key} is required.`)
    }

    return env
}
