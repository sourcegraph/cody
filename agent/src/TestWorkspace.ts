import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import fspromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DOTCOM_URL } from '@sourcegraph/cody-shared'
import { expect } from 'vitest'
import * as vscode from 'vscode'

/**
 * A test workspace is a temporary directory that is created before running tests.
 * Use the `beforeAll` and `afterAll` methods to set up and tear down the workspace.
 **/
export class TestWorkspace {
    public readonly rootUri: vscode.Uri
    public readonly rootPath: string

    constructor(public readonly prototypePath: string) {
        const tmpdir = mkdtempSync(path.join(os.tmpdir(), 'cody-vscode-shim-test'))
        this.rootUri = vscode.Uri.file(tmpdir)
        this.rootPath = tmpdir
    }

    public async beforeAll(): Promise<void> {
        const mayRecord =
            process.env.CODY_RECORDING_MODE === 'record' || process.env.CODY_RECORD_IF_MISSING === 'true'
        if (mayRecord) {
            try {
                execSync('src login', { stdio: 'inherit' })
            } catch {
                throw new Error(
                    "Can't record HTTP requests without being authenticated. " +
                        'To fix this problem, run:\n  source agent/scripts/export-cody-http-recording-tokens.sh'
                )
            }
            expect(new URL(process.env.SRC_ENDPOINT ?? '')).toStrictEqual(DOTCOM_URL)
        }

        await fspromises.mkdir(this.rootPath, { recursive: true })
        await fspromises.cp(this.prototypePath, this.rootPath, {
            recursive: true,
        })
    }
    public file(...pathParts: string[]): vscode.Uri {
        return vscode.Uri.file(path.join(this.rootPath, ...pathParts))
    }

    public async afterAll(): Promise<void> {
        await fspromises.rm(this.rootPath, {
            recursive: true,
            force: true,
        })
    }
}
