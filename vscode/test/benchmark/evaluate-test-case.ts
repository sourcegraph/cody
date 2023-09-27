import { exec as _exec } from 'child_process'
import { copyFile, cp, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'

import { TEST_WORKSPACE_PATH } from './constants'
import { commitSignatureEnv } from './git-helpers'

const exec = promisify(_exec)

export enum CaseStatus {
    'PASS',
    'FAIL',
    'TIMED_OUT',
}

export interface CaseResult {
    status: CaseStatus
}

export const testCompletionResult = async (
    testFile: string,
    testCommand: string,
    cwd: string
): Promise<CaseStatus.PASS | CaseStatus.FAIL> => {
    let status: CaseStatus
    try {
        await exec(`${testCommand} ${testFile}`, { cwd })
        status = CaseStatus.PASS
    } catch {
        status = CaseStatus.FAIL
    }
    return status
}

export const copyFileToWorkspace = async (workspaceDir: string, fileName: string, cwd: string): Promise<void> => {
    const filePath = path.join(cwd, fileName)
    const tempFilePath = path.join(workspaceDir, path.basename(filePath))
    await copyFile(filePath, tempFilePath)
}

export const createTemporaryWorkspace = async (filePaths: string[], cwd: string): Promise<string> => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'cody-evaluation-'))
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
